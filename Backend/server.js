import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { createRequestHandler } from '@remix-run/node';
import * as build from '../build/server/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const port = 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

// Backend API exposure
app.use(express.json());
app.use(cors());
app.use(express.static('build/client'));
app.all('*', createRequestHandler({ build }));

// Serve static files (public folder)
app.use(express.static(path.join(__dirname, '../public')));

io.on('connection', socket => {
  console.log('A client has connected', socket.id);

  socket.on('disconnect', () => {
    console.log('Client has disconnected');
  });
});

app.all(
  '*',
  createRequestHandler({
    getLoadContext: () => ({ io }), // Inject Socket.IO into the context
  }),
);

httpServer.listen(port, () => {
  console.log(`Server is listening on port: ${port}`);
});
