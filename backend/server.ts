import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { createRequestHandler } from '@remix-run/express';
import * as build from '../build/server/index';
import path from 'path';
import { fileURLToPath } from 'url';
import Redis from 'ioredis';
import { RedisRoomManager } from './redis/redisRoomManager';
import { ServerBuild } from '@remix-run/node';

const port = 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

const redis = new Redis();
const roomManager = new RedisRoomManager(redis);

// Backend API exposure
app.use(express.json());
app.use(cors());
app.use(express.static('build/client'));
app.all('*', createRequestHandler({ build}));

// Serve static files (public folder)
app.use(express.static(path.join(__dirname, '../public')));

io.on('connection', socket => {
  console.log('A client has connected', socket.id);

  socket.on('createRoom', async ({ roomCode, player }) => {
    console.log(`I pinged ${player}`);
    await roomManager.createRoom(roomCode);
    await roomManager.addPlayer(roomCode, player);

    const players = await roomManager.getPlayers(roomCode);

    io.to(roomCode).emit('updatePlayers', players);
    socket.emit('joinedRoom', roomCode);
  });

  socket.on('disconnect', () => {
    console.log('Client has disconnected');
  });
});

app.all(
  '*',
  createRequestHandler({
    build: build as ServerBuild,
    getLoadContext: () => ({ io }), // Inject Socket.IO into the context
  }),
);

httpServer.listen(port, () => {
  console.log(`Server is listening on port: ${port}`);
});
