import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import Redis from 'ioredis';
import { RedisRoomManager } from './redis/redisRoomManager';
import { registerRoomHandlers } from './handlers/roomHandlers';
import { registerGameHandlers } from './handlers/gameHandlers';

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

if (!isDev) {
  const { createRequestHandler } = await import('@remix-run/express');
  const build = await import('../build/server/index');
  app.use(express.static('build/client'));
  app.use(express.static(path.join(__dirname, '../public')));
  app.all('*', createRequestHandler({ build, getLoadContext: () => ({ io }) }));
}

io.on('connection', socket => {
  console.log('A client has connected', socket.id);
  registerRoomHandlers(io, socket, roomManager);
  registerGameHandlers(io, socket, roomManager);
  socket.on('disconnect', () => console.log('Client has disconnected'));
});

httpServer.listen(port, () => {
  console.log(`Server is listening on port: ${port}`);
});

async function shutdown() {
  console.log('Shutting down — cleaning up Redis...');
  try {
    const rooms = await roomManager.getAllRooms();
    await Promise.all(rooms.map(code => roomManager.deleteRoom(code)));
    await redis.del('uno:rooms');
    console.log(`Cleaned up ${rooms.length} room(s).`);
  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    redis.disconnect();
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
