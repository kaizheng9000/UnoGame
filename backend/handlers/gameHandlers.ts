import type { Server, Socket } from 'socket.io';
import { RedisRoomManager } from '../redis/redisRoomManager';
import UnoDeck from '../game/unoDeck';
import type { UnoCard, FullGameState } from '../../shared/types';

function emitGameStateToAll(io: Server, gameState: FullGameState, effect?: string) {
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
        effect,
      });
    }
  }
}

function getNextIndex(currentId: string, players: { id: string }[], direction: 1 | -1, skip = false): number {
  const current = players.findIndex(p => p.id === currentId);
  const step = skip ? direction * 2 : direction;
  return ((current + step) % players.length + players.length) % players.length;
}

// Module-level: tracks rematch state across all sockets
const rematchVotes = new Map<string, Set<string>>();   // playerIds who clicked Play Again
const rematchLeavers = new Map<string, Set<string>>(); // playerIds who clicked Leave

function checkRematchReady(io: Server, roomCode: string, allPlayers: { id: string; name: string }[]) {
  const voters = rematchVotes.get(roomCode) ?? new Set<string>();
  const leavers = rematchLeavers.get(roomCode) ?? new Set<string>();
  const eligible = allPlayers.filter(p => !leavers.has(p.id));
  const votes = eligible.filter(p => voters.has(p.id)).length;
  const total = eligible.length;

  io.to(roomCode).emit('rematchStatus', { votes, total });

  if (total < 2) {
    // Not enough players left to play — tell the last remaining player
    eligible.forEach(p => {
      io.sockets.sockets.get(p.id)?.emit('rematchCancelled');
    });
    rematchVotes.delete(roomCode);
    rematchLeavers.delete(roomCode);
    return false;
  }
  if (votes >= total) return true; // everyone eligible has voted
  return false;
}

async function startNewGame(io: Server, roomCode: string, roomManager: RedisRoomManager, playerIds?: string[]) {
  const allPlayers = await roomManager.getPlayers(roomCode);
  const players = playerIds ? allPlayers.filter(p => playerIds.includes(p.id)) : allPlayers;
  const deck = new UnoDeck();
  const hands: Record<string, UnoCard[]> = {};

  for (const player of players) {
    hands[player.id] = [];
    for (let i = 0; i < 7; i++) {
      const card = deck.drawCard();
      if (card) hands[player.id].push(card);
    }
  }

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
  return { gameState, deck, hands, players };
}

export function registerGameHandlers(io: Server, socket: Socket, roomManager: RedisRoomManager) {
  socket.on('startGame', async ({ roomCode }: { roomCode: string }) => {
    try {
      const { gameState, players, hands } = await startNewGame(io, roomCode, roomManager);
      for (const player of players) {
        const playerSocket = io.sockets.sockets.get(player.id);
        if (playerSocket) {
          playerSocket.emit('gameStarted', {
            hand: hands[player.id],
            topCard: gameState.discardPile[gameState.discardPile.length - 1],
            currentTurn: gameState.currentTurn,
            deckCount: gameState.deckCards.length,
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

  socket.on('rematch', async ({ roomCode }: { roomCode: string }) => {
    try {
      const rawState = await roomManager.getGameState(roomCode) as unknown as FullGameState | null;
      if (!rawState) return;

      if (!rematchVotes.has(roomCode)) rematchVotes.set(roomCode, new Set());
      rematchVotes.get(roomCode)!.add(socket.id);

      const ready = checkRematchReady(io, roomCode, rawState.players);
      if (ready) {
        const voterIds = [...rematchVotes.get(roomCode)!];
        rematchVotes.delete(roomCode);
        rematchLeavers.delete(roomCode);
        const { gameState, players, hands } = await startNewGame(io, roomCode, roomManager, voterIds);
        for (const player of players) {
          io.sockets.sockets.get(player.id)?.emit('rematchStarted', {
            hand: hands[player.id],
            topCard: gameState.discardPile[gameState.discardPile.length - 1],
            currentTurn: gameState.currentTurn,
            deckCount: gameState.deckCards.length,
            players: players.map(p => ({ id: p.id, name: p.name, cardCount: hands[p.id].length })),
            myId: player.id,
          });
        }
      }
    } catch (err) {
      console.error('rematch error:', err);
    }
  });

  socket.on('leaveRematch', async ({ roomCode }: { roomCode: string }) => {
    try {
      const rawState = await roomManager.getGameState(roomCode) as unknown as FullGameState | null;
      if (!rawState) return;

      if (!rematchLeavers.has(roomCode)) rematchLeavers.set(roomCode, new Set());
      rematchLeavers.get(roomCode)!.add(socket.id);
      rematchVotes.get(roomCode)?.delete(socket.id);

      const ready = checkRematchReady(io, roomCode, rawState.players);
      if (ready) {
        const voterIds = [...rematchVotes.get(roomCode)!];
        rematchVotes.delete(roomCode);
        rematchLeavers.delete(roomCode);
        const { gameState, players, hands } = await startNewGame(io, roomCode, roomManager, voterIds);
        for (const player of players) {
          io.sockets.sockets.get(player.id)?.emit('rematchStarted', {
            hand: hands[player.id],
            topCard: gameState.discardPile[gameState.discardPile.length - 1],
            currentTurn: gameState.currentTurn,
            deckCount: gameState.deckCards.length,
            players: players.map(p => ({ id: p.id, name: p.name, cardCount: hands[p.id].length })),
            myId: player.id,
          });
        }
      }
    } catch (err) {
      console.error('leaveRematch error:', err);
    }
  });

  socket.on('playCard', async ({ roomCode, card, chosenColor }: { roomCode: string; card: UnoCard; chosenColor?: string }) => {
    try {
      const gameState = await roomManager.getGameState(roomCode) as unknown as FullGameState;
      if (!gameState || gameState.currentTurn !== socket.id) return;

      const topCard = gameState.discardPile[gameState.discardPile.length - 1];
      const isValid = card.type === 'wild' || card.color === topCard.color || card.value === topCard.value;
      if (!isValid) { socket.emit('gameError', 'Invalid card'); return; }

      const handIndex = gameState.hands[socket.id].findIndex(c => c.color === card.color && c.value === card.value);
      if (handIndex === -1) { socket.emit('gameError', 'Card not in hand'); return; }
      gameState.hands[socket.id].splice(handIndex, 1);

      const playedCard = card.type === 'wild' && chosenColor ? { ...card, color: chosenColor } : card;
      gameState.discardPile.push(playedCard);

      // Win condition
      if (gameState.hands[socket.id].length === 0) {
        io.to(roomCode).emit('gameOver', {
          winnerId: socket.id,
          winnerName: gameState.players.find(p => p.id === socket.id)?.name,
        });
        // Keep room alive for rematch (5 min TTL), clear game state so votes can be tracked
        await roomManager.saveGameState(roomCode, gameState as unknown as Record<string, unknown>);
        return;
      }

      let skip = false;
      let effect: string | undefined;
      const playerName = gameState.players.find(p => p.id === socket.id)?.name ?? 'Player';

      if (playedCard.value === 'reverse') {
        gameState.direction = (gameState.direction * -1) as 1 | -1;
        if (gameState.players.length === 2) {
          skip = true;
          effect = `${playerName} reversed — plays again!`;
        } else {
          effect = `${playerName} reversed direction!`;
        }
      } else if (playedCard.value === 'skip') {
        skip = true;
        const skippedIdx = getNextIndex(socket.id, gameState.players, gameState.direction);
        effect = `${gameState.players[skippedIdx].name} was skipped!`;
      } else if (playedCard.value === 'draw two') {
        const nextIdx = getNextIndex(socket.id, gameState.players, gameState.direction);
        const nextId = gameState.players[nextIdx].id;
        for (let i = 0; i < 2; i++) {
          const drawn = gameState.deckCards.pop();
          if (drawn) gameState.hands[nextId].push(drawn);
        }
        skip = true;
        effect = `${gameState.players[nextIdx].name} draws 2 and is skipped!`;
      } else if (playedCard.value === 'wild draw four') {
        const nextIdx = getNextIndex(socket.id, gameState.players, gameState.direction);
        const nextId = gameState.players[nextIdx].id;
        for (let i = 0; i < 4; i++) {
          const drawn = gameState.deckCards.pop();
          if (drawn) gameState.hands[nextId].push(drawn);
        }
        skip = true;
        effect = `${gameState.players[nextIdx].name} draws 4 and is skipped!`;
      }

      const nextIdx = getNextIndex(socket.id, gameState.players, gameState.direction, skip);
      gameState.currentTurn = gameState.players[nextIdx].id;

      await roomManager.saveGameState(roomCode, gameState as unknown as Record<string, unknown>);
      emitGameStateToAll(io, gameState, effect);
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
      emitGameStateToAll(io, gameState);
    } catch (err) {
      console.error('drawCard error:', err);
    }
  });
}
