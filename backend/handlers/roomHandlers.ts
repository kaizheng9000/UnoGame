import type { Server, Socket } from 'socket.io';
import { RedisRoomManager } from '../redis/redisRoomManager';
import Player from '../game/player';

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function registerRoomHandlers(io: Server, socket: Socket, roomManager: RedisRoomManager) {
  socket.on('createRoom', async ({ playerName, maxPlayers }: {
    playerName: string; maxPlayers: string;
  }) => {
    try {
      const roomCode = generateRoomCode();
      const player = new Player(socket.id, playerName);
      await roomManager.createRoom(roomCode);
      await roomManager.setRoomInfo(roomCode, { maxPlayers: parseInt(maxPlayers) });
      await roomManager.addPlayer(roomCode, player);
      socket.join(roomCode);

      const players = await roomManager.getPlayers(roomCode);
      socket.emit('joinedRoom', { roomCode, isHost: true, maxPlayers: parseInt(maxPlayers), players });
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
      socket.emit('joinedRoom', { roomCode, isHost: false, maxPlayers: roomInfo?.maxPlayers, players });
      io.to(roomCode).emit('updatePlayers', players);
    } catch (err) {
      console.error('joinRoom error:', err);
      socket.emit('roomError', 'Failed to join room. Is Redis running?');
    }
  });
}
