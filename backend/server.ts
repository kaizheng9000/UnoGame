import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import Redis from 'ioredis';
import { RedisRoomManager } from './redis/redisRoomManager';
import Player from './models/player';
import UnoDeck, { UnoCard } from './models/unoDeck';

const port = 3001;
const isDev = process.env.NODE_ENV !== 'production';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

const redis = new Redis();
const roomManager = new RedisRoomManager(redis);

app.use(express.json());
app.use(cors());

// In production, serve the Remix build; in dev, Vite handles the frontend
if (!isDev) {
  const { createRequestHandler } = await import('@remix-run/express');
  const build = await import('../build/server/index');
  app.use(express.static('build/client'));
  app.use(express.static(path.join(__dirname, '../public')));
  app.all('*', createRequestHandler({ build, getLoadContext: () => ({ io }) }));
}

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

interface FullGameState {
  deckCards: UnoCard[];
  discardPile: UnoCard[];
  currentTurn: string;
  players: { id: string; name: string }[];
  hands: Record<string, UnoCard[]>;
  direction: 1 | -1;
}

function emitGameStateToAll(gameState: FullGameState) {
  for (const player of gameState.players) {
    const playerSocket = io.sockets.sockets.get(player.id);
    if (playerSocket) {
      playerSocket.emit('gameStateUpdate', {
        hand: gameState.hands[player.id] ?? [],
        topCard: gameState.discardPile[gameState.discardPile.length - 1],
        currentTurn: gameState.currentTurn,
        deckCount: gameState.deckCards.length,
        players: gameState.players.map(p => ({
          id: p.id,
          name: p.name,
          cardCount: gameState.hands[p.id]?.length ?? 0,
        })),
        myId: player.id,
      });
    }
  }
}

function getNextIndex(currentId: string, players: { id: string }[], direction: 1 | -1, skip = false): number {
  const current = players.findIndex(p => p.id === currentId);
  const step = skip ? direction * 2 : direction;
  return ((current + step) % players.length + players.length) % players.length;
}

io.on('connection', socket => {
  console.log('A client has connected', socket.id);

  socket.on('createRoom', async ({ roomCode: rawCode, playerName, roomName, maxPlayers }: { roomCode: string; playerName: string; roomName: string; maxPlayers: string }) => {
    try {
      const roomCode = rawCode?.trim() || generateRoomCode();
      const rooms = await roomManager.getAllRooms();
      if (rooms.includes(roomCode)) {
        socket.emit('roomError', 'Room code already in use, please choose another');
        return;
      }
      const player = new Player(socket.id, playerName);
      await roomManager.createRoom(roomCode);
      await roomManager.setRoomInfo(roomCode, { roomName, maxPlayers: parseInt(maxPlayers) });
      await roomManager.addPlayer(roomCode, player);
      socket.join(roomCode);

      const players = await roomManager.getPlayers(roomCode);
      socket.emit('joinedRoom', { roomCode, isHost: true, roomName, maxPlayers: parseInt(maxPlayers), players });
      io.to(roomCode).emit('updatePlayers', players);
    } catch (err) {
      console.error('createRoom error:', err);
      socket.emit('roomError', 'Failed to create room. Is Redis running?');
    }
  });

  socket.on('joinRoom', async ({ roomCode, playerName }: { roomCode: string; playerName: string }) => {
    try {
      const rooms = await roomManager.getAllRooms();
      if (!rooms.includes(roomCode)) {
        socket.emit('roomError', 'Room not found');
        return;
      }
      const roomInfo = await roomManager.getRoomInfo(roomCode);
      const player = new Player(socket.id, playerName);
      await roomManager.addPlayer(roomCode, player);
      socket.join(roomCode);

      const players = await roomManager.getPlayers(roomCode);
      socket.emit('joinedRoom', { roomCode, isHost: false, roomName: roomInfo?.roomName, maxPlayers: roomInfo?.maxPlayers, players });
      io.to(roomCode).emit('updatePlayers', players);
    } catch (err) {
      console.error('joinRoom error:', err);
      socket.emit('roomError', 'Failed to join room. Is Redis running?');
    }
  });

  socket.on('startGame', async ({ roomCode }: { roomCode: string }) => {
    try {
      const players = await roomManager.getPlayers(roomCode);
      const deck = new UnoDeck();
      const hands: Record<string, UnoCard[]> = {};

      for (const player of players) {
        hands[player.id] = [];
        for (let i = 0; i < 7; i++) {
          const card = deck.drawCard();
          if (card) hands[player.id].push(card);
        }
      }

      // First card can't be a wild
      let topCard = deck.drawCard();
      while (topCard && topCard.type === 'wild') {
        deck.cards.unshift(topCard);
        topCard = deck.drawCard();
      }

      const gameState: FullGameState = {
        deckCards: deck.cards,
        discardPile: topCard ? [topCard] : [],
        currentTurn: players[0].id,
        players: players.map(p => ({ id: p.id, name: p.name })),
        hands,
        direction: 1,
      };

      await roomManager.saveGameState(roomCode, gameState as unknown as Record<string, unknown>);

      for (const player of players) {
        const playerSocket = io.sockets.sockets.get(player.id);
        if (playerSocket) {
          playerSocket.emit('gameStarted', {
            hand: hands[player.id],
            topCard: gameState.discardPile[gameState.discardPile.length - 1],
            currentTurn: gameState.currentTurn,
            deckCount: deck.cards.length,
            players: players.map(p => ({ id: p.id, name: p.name, cardCount: hands[p.id].length })),
            myId: player.id,
            roomCode,
          });
        }
      }
    } catch (err) {
      console.error('startGame error:', err);
      socket.emit('roomError', 'Failed to start game');
    }
  });

  socket.on('playCard', async ({ roomCode, card, chosenColor }: { roomCode: string; card: UnoCard; chosenColor?: string }) => {
    try {
      const gameState = await roomManager.getGameState(roomCode) as unknown as FullGameState;
      if (!gameState || gameState.currentTurn !== socket.id) return;

      const topCard = gameState.discardPile[gameState.discardPile.length - 1];
      const isValid = card.type === 'wild' || card.color === topCard.color || card.value === topCard.value;
      if (!isValid) { socket.emit('gameError', 'Invalid card'); return; }

      // Remove one instance of the card from hand
      const handIndex = gameState.hands[socket.id].findIndex(c => c.color === card.color && c.value === card.value);
      if (handIndex === -1) { socket.emit('gameError', 'Card not in hand'); return; }
      gameState.hands[socket.id].splice(handIndex, 1);

      // Apply chosen color to wild cards
      const playedCard = card.type === 'wild' && chosenColor ? { ...card, color: chosenColor } : card;
      gameState.discardPile.push(playedCard);

      // Win condition
      if (gameState.hands[socket.id].length === 0) {
        io.to(roomCode).emit('gameOver', { winnerId: socket.id, winnerName: gameState.players.find(p => p.id === socket.id)?.name });
        await roomManager.deleteRoom(roomCode);
        return;
      }

      // Apply special card effects
      let skip = false;
      if (playedCard.value === 'reverse') {
        gameState.direction = (gameState.direction * -1) as 1 | -1;
        if (gameState.players.length === 2) skip = true;
      } else if (playedCard.value === 'skip') {
        skip = true;
      } else if (playedCard.value === 'draw two') {
        const nextIdx = getNextIndex(socket.id, gameState.players, gameState.direction);
        const nextId = gameState.players[nextIdx].id;
        for (let i = 0; i < 2; i++) {
          const drawn = gameState.deckCards.pop();
          if (drawn) gameState.hands[nextId].push(drawn);
        }
        skip = true;
      } else if (playedCard.value === 'wild draw four') {
        const nextIdx = getNextIndex(socket.id, gameState.players, gameState.direction);
        const nextId = gameState.players[nextIdx].id;
        for (let i = 0; i < 4; i++) {
          const drawn = gameState.deckCards.pop();
          if (drawn) gameState.hands[nextId].push(drawn);
        }
        skip = true;
      }

      const nextIdx = getNextIndex(socket.id, gameState.players, gameState.direction, skip);
      gameState.currentTurn = gameState.players[nextIdx].id;

      await roomManager.saveGameState(roomCode, gameState as unknown as Record<string, unknown>);
      emitGameStateToAll(gameState);
    } catch (err) {
      console.error('playCard error:', err);
    }
  });

  socket.on('drawCard', async ({ roomCode }: { roomCode: string }) => {
    try {
      const gameState = await roomManager.getGameState(roomCode) as unknown as FullGameState;
      if (!gameState || gameState.currentTurn !== socket.id) return;

      // Reshuffle discard pile into deck if empty
      if (gameState.deckCards.length === 0) {
        const topCard = gameState.discardPile.pop();
        gameState.deckCards = gameState.discardPile;
        for (let i = gameState.deckCards.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [gameState.deckCards[i], gameState.deckCards[j]] = [gameState.deckCards[j], gameState.deckCards[i]];
        }
        gameState.discardPile = topCard ? [topCard] : [];
      }

      const drawn = gameState.deckCards.pop();
      if (drawn) gameState.hands[socket.id].push(drawn);

      const nextIdx = getNextIndex(socket.id, gameState.players, gameState.direction);
      gameState.currentTurn = gameState.players[nextIdx].id;

      await roomManager.saveGameState(roomCode, gameState as unknown as Record<string, unknown>);
      emitGameStateToAll(gameState);
    } catch (err) {
      console.error('drawCard error:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client has disconnected');
  });
});

httpServer.listen(port, () => {
  console.log(`Server is listening on port: ${port}`);
});
