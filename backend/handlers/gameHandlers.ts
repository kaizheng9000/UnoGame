import type { Server, Socket } from 'socket.io';
import { RedisRoomManager } from '../redis/redisRoomManager';
import UnoDeck from '../game/unoDeck';
import Player from '../game/player';
import type { UnoCard, FullGameState } from '../../shared/types';
import { isBotId, chooseBotCard, chooseBotWildColor } from '../game/botPlayer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emitGameStateToAll(io: Server, gameState: FullGameState, effect?: string) {
  for (const player of gameState.players) {
    if (isBotId(player.id)) continue;
    io.sockets.sockets.get(player.id)?.emit('gameStateUpdate', {
      hand: gameState.hands[player.id] ?? [],
      topCard: gameState.discardPile[gameState.discardPile.length - 1],
      currentTurn: gameState.currentTurn,
      deckCount: gameState.deckCards.length,
      discardCount: gameState.discardPile.length,
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

function getNextIndex(currentId: string, players: { id: string }[], direction: 1 | -1, skip = false): number {
  const current = players.findIndex(p => p.id === currentId);
  const step = skip ? direction * 2 : direction;
  return ((current + step) % players.length + players.length) % players.length;
}

// ---------------------------------------------------------------------------
// Rematch state
// ---------------------------------------------------------------------------

const rematchVotes = new Map<string, Set<string>>();
const rematchLeavers = new Map<string, Set<string>>();

function checkRematchReady(io: Server, roomCode: string, allPlayers: { id: string; name: string }[]) {
  const voters  = rematchVotes.get(roomCode)  ?? new Set<string>();
  const leavers = rematchLeavers.get(roomCode) ?? new Set<string>();
  const eligible = allPlayers.filter(p => !leavers.has(p.id));
  const humanEligible = eligible.filter(p => !isBotId(p.id));
  const humanVotes = humanEligible.filter(p => voters.has(p.id)).length;

  io.to(roomCode).emit('rematchStatus', { votes: humanVotes, total: humanEligible.length });

  if (eligible.length < 2) {
    humanEligible.forEach(p => io.sockets.sockets.get(p.id)?.emit('rematchCancelled'));
    rematchVotes.delete(roomCode);
    rematchLeavers.delete(roomCode);
    return false;
  }
  return humanVotes >= humanEligible.length && humanEligible.length >= 1;
}

// ---------------------------------------------------------------------------
// Game setup
// ---------------------------------------------------------------------------

async function startNewGame(
  roomCode: string,
  roomManager: RedisRoomManager,
  playerIds?: string[],
) {
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
  return { gameState, hands, players };
}

// ---------------------------------------------------------------------------
// Shared card-play / draw logic (used by both human handlers and bot)
// ---------------------------------------------------------------------------

async function processCardPlay(
  io: Server,
  roomCode: string,
  roomManager: RedisRoomManager,
  gameState: FullGameState,
  playerId: string,
  card: UnoCard,
  chosenColor?: string,
) {
  const handIndex = gameState.hands[playerId].findIndex(
    c => c.color === card.color && c.value === card.value,
  );
  if (handIndex === -1) return;
  gameState.hands[playerId].splice(handIndex, 1);

  const playedCard = card.type === 'wild' && chosenColor ? { ...card, color: chosenColor } : card;
  gameState.discardPile.push(playedCard);

  if (gameState.hands[playerId].length === 0) {
    io.to(roomCode).emit('gameOver', {
      winnerId: playerId,
      winnerName: gameState.players.find(p => p.id === playerId)?.name,
    });
    await roomManager.saveGameState(roomCode, gameState as unknown as Record<string, unknown>);
    return;
  }

  let skip = false;
  let effect: string | undefined;
  const playerName = gameState.players.find(p => p.id === playerId)?.name ?? 'Player';

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
    const skippedIdx = getNextIndex(playerId, gameState.players, gameState.direction);
    effect = `${gameState.players[skippedIdx].name} was skipped!`;
  } else if (playedCard.value === 'draw two') {
    const nextIdx = getNextIndex(playerId, gameState.players, gameState.direction);
    const nextId = gameState.players[nextIdx].id;
    for (let i = 0; i < 2; i++) {
      const drawn = gameState.deckCards.pop();
      if (drawn) gameState.hands[nextId].push(drawn);
    }
    skip = true;
    effect = `${gameState.players[nextIdx].name} draws 2 and is skipped!`;
  } else if (playedCard.value === 'wild draw four') {
    const nextIdx = getNextIndex(playerId, gameState.players, gameState.direction);
    const nextId = gameState.players[nextIdx].id;
    for (let i = 0; i < 4; i++) {
      const drawn = gameState.deckCards.pop();
      if (drawn) gameState.hands[nextId].push(drawn);
    }
    skip = true;
    effect = `${gameState.players[nextIdx].name} draws 4 and is skipped!`;
  }

  const nextIdx = getNextIndex(playerId, gameState.players, gameState.direction, skip);
  gameState.currentTurn = gameState.players[nextIdx].id;

  await roomManager.saveGameState(roomCode, gameState as unknown as Record<string, unknown>);
  emitGameStateToAll(io, gameState, effect);

  if (isBotId(gameState.currentTurn)) scheduleBotTurn(io, roomCode, roomManager);
}

async function processDrawCard(
  io: Server,
  roomCode: string,
  roomManager: RedisRoomManager,
  gameState: FullGameState,
  playerId: string,
) {
  if (gameState.deckCards.length === 0) {
    const top = gameState.discardPile.pop();
    gameState.deckCards = [...gameState.discardPile];
    for (let i = gameState.deckCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [gameState.deckCards[i], gameState.deckCards[j]] = [gameState.deckCards[j], gameState.deckCards[i]];
    }
    gameState.discardPile = top ? [top] : [];
  }

  const drawn = gameState.deckCards.pop();
  if (drawn) gameState.hands[playerId].push(drawn);

  const nextIdx = getNextIndex(playerId, gameState.players, gameState.direction);
  gameState.currentTurn = gameState.players[nextIdx].id;

  await roomManager.saveGameState(roomCode, gameState as unknown as Record<string, unknown>);
  emitGameStateToAll(io, gameState);

  if (isBotId(gameState.currentTurn)) scheduleBotTurn(io, roomCode, roomManager);
}

// ---------------------------------------------------------------------------
// Bot turn scheduling
// ---------------------------------------------------------------------------

function scheduleBotTurn(io: Server, roomCode: string, roomManager: RedisRoomManager, delay = 1100) {
  setTimeout(async () => {
    const gameState = await roomManager.getGameState(roomCode) as unknown as FullGameState | null;
    if (!gameState || !isBotId(gameState.currentTurn)) return;

    const botId = gameState.currentTurn;
    const hand = gameState.hands[botId];
    const topCard = gameState.discardPile[gameState.discardPile.length - 1];
    const cardToPlay = chooseBotCard(hand, topCard);

    if (cardToPlay) {
      const chosenColor = cardToPlay.type === 'wild' ? chooseBotWildColor(hand) : undefined;
      await processCardPlay(io, roomCode, roomManager, gameState, botId, cardToPlay, chosenColor);
    } else {
      await processDrawCard(io, roomCode, roomManager, gameState, botId);
    }
  }, delay);
}

// ---------------------------------------------------------------------------
// Helper: emit rematchStarted to all human players and schedule bots if needed
// ---------------------------------------------------------------------------

async function doRematch(
  io: Server,
  roomCode: string,
  roomManager: RedisRoomManager,
  allIds: string[],
) {
  rematchVotes.delete(roomCode);
  rematchLeavers.delete(roomCode);
  const { gameState, players, hands } = await startNewGame(roomCode, roomManager, allIds);
  for (const player of players) {
    if (isBotId(player.id)) continue;
    io.sockets.sockets.get(player.id)?.emit('rematchStarted', {
      hand: hands[player.id],
      topCard: gameState.discardPile[gameState.discardPile.length - 1],
      currentTurn: gameState.currentTurn,
      deckCount: gameState.deckCards.length,
      discardCount: gameState.discardPile.length,
      players: players.map(p => ({ id: p.id, name: p.name, cardCount: hands[p.id].length })),
      myId: player.id,
    });
  }
  if (isBotId(gameState.currentTurn)) scheduleBotTurn(io, roomCode, roomManager);
}

function buildRematchPlayerIds(roomCode: string, allPlayers: { id: string }[]) {
  const leavers = rematchLeavers.get(roomCode) ?? new Set<string>();
  const eligible = allPlayers.filter(p => !leavers.has(p.id));
  const humanVoters = [...(rematchVotes.get(roomCode) ?? [])].filter(id => !isBotId(id));
  const bots = eligible.filter(p => isBotId(p.id)).map(p => p.id);
  return [...humanVoters, ...bots];
}

// ---------------------------------------------------------------------------
// Socket handlers
// ---------------------------------------------------------------------------

export function registerGameHandlers(io: Server, socket: Socket, roomManager: RedisRoomManager) {

  // --- Multiplayer: start from waiting room ---
  socket.on('startGame', async ({ roomCode }: { roomCode: string }) => {
    try {
      const { gameState, players, hands } = await startNewGame(roomCode, roomManager);
      for (const player of players) {
        if (isBotId(player.id)) continue;
        io.sockets.sockets.get(player.id)?.emit('gameStarted', {
          hand: hands[player.id],
          topCard: gameState.discardPile[gameState.discardPile.length - 1],
          currentTurn: gameState.currentTurn,
          deckCount: gameState.deckCards.length,
      discardCount: gameState.discardPile.length,
          players: players.map(p => ({ id: p.id, name: p.name, cardCount: hands[p.id].length })),
          myId: player.id,
          roomCode,
        });
      }
      if (isBotId(gameState.currentTurn)) scheduleBotTurn(io, roomCode, roomManager);
    } catch (err) {
      console.error('startGame error:', err);
      socket.emit('roomError', 'Failed to start game');
    }
  });

  // --- Single player: create room + bots + start immediately ---
  socket.on('createSinglePlayerRoom', async ({ playerName, botCount }: { playerName: string; botCount: number }) => {
    try {
      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      await roomManager.createRoom(roomCode);
      await roomManager.setRoomInfo(roomCode, { maxPlayers: 1 + botCount });
      await roomManager.addPlayer(roomCode, new Player(socket.id, playerName));
      for (let i = 1; i <= botCount; i++) {
        await roomManager.addPlayer(roomCode, new Player(`bot_${roomCode}_${i}`, `Bot ${i}`));
      }
      socket.join(roomCode);

      const { gameState, players, hands } = await startNewGame(roomCode, roomManager);
      socket.emit('gameStarted', {
        hand: hands[socket.id],
        topCard: gameState.discardPile[gameState.discardPile.length - 1],
        currentTurn: gameState.currentTurn,
        deckCount: gameState.deckCards.length,
      discardCount: gameState.discardPile.length,
        players: players.map(p => ({ id: p.id, name: p.name, cardCount: hands[p.id].length })),
        myId: socket.id,
        roomCode,
      });

      if (isBotId(gameState.currentTurn)) scheduleBotTurn(io, roomCode, roomManager);
    } catch (err) {
      console.error('createSinglePlayerRoom error:', err);
      socket.emit('roomError', 'Failed to create game');
    }
  });

  // --- Rematch ---
  socket.on('rematch', async ({ roomCode }: { roomCode: string }) => {
    try {
      const rawState = await roomManager.getGameState(roomCode) as unknown as FullGameState | null;
      if (!rawState) return;
      if (!rematchVotes.has(roomCode)) rematchVotes.set(roomCode, new Set());
      rematchVotes.get(roomCode)!.add(socket.id);
      if (checkRematchReady(io, roomCode, rawState.players)) {
        await doRematch(io, roomCode, roomManager, buildRematchPlayerIds(roomCode, rawState.players));
      }
    } catch (err) { console.error('rematch error:', err); }
  });

  socket.on('leaveRematch', async ({ roomCode }: { roomCode: string }) => {
    try {
      const rawState = await roomManager.getGameState(roomCode) as unknown as FullGameState | null;
      if (!rawState) return;
      if (!rematchLeavers.has(roomCode)) rematchLeavers.set(roomCode, new Set());
      rematchLeavers.get(roomCode)!.add(socket.id);
      rematchVotes.get(roomCode)?.delete(socket.id);
      if (checkRematchReady(io, roomCode, rawState.players)) {
        await doRematch(io, roomCode, roomManager, buildRematchPlayerIds(roomCode, rawState.players));
      }
    } catch (err) { console.error('leaveRematch error:', err); }
  });

  // --- Play card ---
  socket.on('playCard', async ({ roomCode, card, chosenColor }: { roomCode: string; card: UnoCard; chosenColor?: string }) => {
    try {
      const gameState = await roomManager.getGameState(roomCode) as unknown as FullGameState;
      if (!gameState || gameState.currentTurn !== socket.id) return;
      const topCard = gameState.discardPile[gameState.discardPile.length - 1];
      const isValid = card.type === 'wild' || card.color === topCard.color || card.value === topCard.value;
      if (!isValid) { socket.emit('gameError', 'Invalid card'); return; }
      await processCardPlay(io, roomCode, roomManager, gameState, socket.id, card, chosenColor);
    } catch (err) { console.error('playCard error:', err); }
  });

  // --- Draw card ---
  socket.on('drawCard', async ({ roomCode }: { roomCode: string }) => {
    try {
      const gameState = await roomManager.getGameState(roomCode) as unknown as FullGameState;
      if (!gameState || gameState.currentTurn !== socket.id) return;
      await processDrawCard(io, roomCode, roomManager, gameState, socket.id);
    } catch (err) { console.error('drawCard error:', err); }
  });
}
