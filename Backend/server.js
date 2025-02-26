

const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");

const port = 3000;
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { 
    serveClient: false /* dont need the client bundle to be exposed  */
 });

io.on("connection", (socket) => {
  console.log("A client has connected");
});

httpServer.listen(port, () => {
    console.log(`Server is running on ${port}`);
});