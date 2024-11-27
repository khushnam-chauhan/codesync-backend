const express = require('express');
const app = express();
require('dotenv').config();
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const ACTIONS = require('./Actions');

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
      origin: [
        process.env.FRONTEND_URL || "https://codesync-front.onrender.com",
        "http://localhost:3000"
      ],
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type"],
      credentials: true
    }
  });

const userSocketMap = {};

app.use(cors({
    origin: process.env.FRONTEND_URL || "https://codesync.vercel.app",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true
  }));

  app.get('/api', (req, res) => {
    res.json({ message: "Backend is running!" });
  });

function getAllConnectedClients(roomId) {
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map((socketId) => {
        return {
            socketId,
            username: userSocketMap[socketId],
        };
    });
}

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    // Handle user joining a room
    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        if (!roomId || !username) {
            console.error('Invalid join request');
            return;
        }

        userSocketMap[socket.id] = username;
        socket.join(roomId);

        const clients = getAllConnectedClients(roomId);
        console.log(`Clients in room ${roomId}:`, clients);

        // Notify all clients in the room about the new join
        io.to(roomId).emit(ACTIONS.JOINED, {
            clients,
            username,
            socketId: socket.id,
        });
    });

    // Handle code changes and broadcast them
    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        socket.to(roomId).emit(ACTIONS.CODE_CHANGE, { code });
    });
    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    });
    

    // Handle disconnection
    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.to(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        });

        // Clean up user mapping
        delete userSocketMap[socket.id];
    });

    // Optionally, add a 'disconnect' event if specific actions need to be handled after full disconnect
    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});
module.exports = server;