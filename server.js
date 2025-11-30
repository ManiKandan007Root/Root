import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Game } from './src/Game.js';
import { Player } from './src/Player.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Serve index.html for the root route and any other route (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('createGame', (playerName, callback) => {
    const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    const game = new Game();
    game.hostGame(playerName, roomCode);

    // Override updateUI to broadcast state
    game.setUpdateCallback(() => {
      io.to(roomCode).emit('gameState', getGameState(game));
    });

    rooms[roomCode] = game;
    socket.join(roomCode);

    // Store player info on socket for easy access
    socket.data.roomCode = roomCode;
    socket.data.playerName = playerName;
    socket.data.playerIndex = 0; // Host is 0

    callback({ roomCode, playerIndex: 0 });
    io.to(roomCode).emit('gameState', getGameState(game));
  });

  socket.on('joinGame', ({ roomCode, playerName }, callback) => {
    console.log(`User ${playerName} attempting to join room: ${roomCode}`);
    console.log('Available rooms:', Object.keys(rooms));

    const game = rooms[roomCode];
    if (game) {
      if (game.gameState !== 'HOSTING' && game.gameState !== 'LOBBY') {
        return callback({ error: 'Game already started' });
      }

      const newPlayer = new Player(playerName, false);
      game.players.push(newPlayer);
      const playerIndex = game.players.length - 1;

      socket.join(roomCode);
      socket.data.roomCode = roomCode;
      socket.data.playerName = playerName;
      socket.data.playerIndex = playerIndex;

      callback({ roomCode, playerIndex });
      game.updateUI(); // This triggers the broadcast
    } else {
      console.log(`Room ${roomCode} not found!`);
      callback({ error: 'Room not found' });
    }
  });

  socket.on('startGame', () => {
    const { roomCode } = socket.data;
    const game = rooms[roomCode];
    if (game) {
      game.startGame();
    }
  });

  socket.on('playCard', ({ cardIndex, wildColor }) => {
    const { roomCode, playerIndex } = socket.data;
    const game = rooms[roomCode];
    if (game) {
      // Verify it's this player's turn
      if (game.currentPlayerIndex !== playerIndex) return;

      game.humanPlay(cardIndex, wildColor);
    }
  });

  socket.on('drawCard', () => {
    const { roomCode, playerIndex } = socket.data;
    const game = rooms[roomCode];
    if (game) {
      if (game.currentPlayerIndex !== playerIndex) return;
      game.humanDraw();
    }
  });

  socket.on('updateSettings', (newSettings) => {
    const { roomCode, playerIndex } = socket.data;
    const game = rooms[roomCode];
    if (game && playerIndex === 0) { // Only host
      game.updateSettings(newSettings);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Handle player disconnect (maybe pause game or remove player if in lobby)
  });
});

function getGameState(game) {
  return {
    players: game.players.map(p => ({
      name: p.name,
      handCount: p.hand.length,
      isComputer: p.isComputer,
      // We need to send the hand to the specific player, but for simplicity in this broadcast
      // we might send all hands but hide them in UI, OR we send a sanitized version.
      // For a secure game, we should send specific data to specific sockets.
      // But for this prototype, let's send everything and hide in UI.
      hand: p.hand
    })),
    topCard: game.topCard,
    currentColor: game.currentColor,
    currentPlayerIndex: game.currentPlayerIndex,
    gameState: game.gameState,
    gameOver: game.gameOver,
    winner: game.winner ? game.winner.name : null,
    message: game.message,
    roomCode: game.roomCode,
    gameTimeRemaining: game.gameTimeRemaining,
    turnTimeRemaining: game.turnTimeRemaining,
    settings: game.settings
  };
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
