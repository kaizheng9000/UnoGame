const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const gameRoutes = require('./Routes/GameRoutes');
const GameController = require('./Controllers/GameController');

const port = 5000;
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  serveClient: false /* dont need the client bundle to be exposed  */,
});

// Backend API exposure
app.use(express.json());
app.use(express.static(path.join(__dirname, '../src')));
app.use(cors());

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

io.on('connection', socket => {
  console.log('A client has connected');
  socket.emit('sendDeck', GameController.getDeck());
});

httpServer.listen(port, () => {
  console.log(`Server is listening on port: ${port}`);
});
