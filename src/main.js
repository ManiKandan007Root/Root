import './style.css';
import './lobby.css';
import { io } from 'socket.io-client';
import { soundManager } from './SoundManager.js';

const socket = io();
const app = document.querySelector('#app');

// Initialize audio on first interaction
document.addEventListener('click', () => {
  soundManager.init();
}, { once: true });

let gameState = {
  gameState: 'LOBBY',
  players: [],
  currentPlayerIndex: 0,
  topCard: null,
  currentColor: null,
  message: 'Welcome to Uno!',
  gameOver: false,
  winner: null,
  roomCode: ''
};

let previousGameState = null;
let myPlayerIndex = -1;
let pendingWildCardIdx = null;

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('gameState', (state) => {
  // Sound Logic
  if (previousGameState && state.gameState === 'PLAYING') {
    // Check for card played (Top card changed)
    if (previousGameState.topCard && state.topCard &&
      (previousGameState.topCard.id !== state.topCard.id)) {
      soundManager.playCardPlace();
    }

    // Check for draws (Hand size increased)
    const myHandSize = state.players[myPlayerIndex]?.hand.length || 0;
    const prevMyHandSize = previousGameState.players[myPlayerIndex]?.hand.length || 0;

    if (myHandSize > prevMyHandSize) {
      soundManager.playCardFlip();
    }

    // Check for UNO shout (someone has 1 card)
    state.players.forEach(p => {
      if (p.hand.length === 1) {
        const prevP = previousGameState.players.find(prev => prev.name === p.name);
        if (prevP && prevP.hand.length > 1) {
          soundManager.playUnoShout();
        }
      }
    });
  }

  // Optimization: Check if only time changed
  if (previousGameState &&
    state.gameState === 'PLAYING' &&
    previousGameState.gameState === 'PLAYING' &&
    state.topCard.id === previousGameState.topCard.id &&
    state.currentPlayerIndex === previousGameState.currentPlayerIndex &&
    state.players[myPlayerIndex].hand.length === previousGameState.players[myPlayerIndex].hand.length &&
    state.currentColor === previousGameState.currentColor &&
    state.message === previousGameState.message &&
    state.gameOver === previousGameState.gameOver) {

    // Only update timers
    const gameTimerEl = document.querySelector('.game-timer');
    const turnTimerEl = document.querySelector('.turn-timer');

    if (gameTimerEl && state.settings?.gameTimerEnabled) {
      gameTimerEl.textContent = `Game: ${formatTime(state.gameTimeRemaining)}`;
    }

    if (turnTimerEl && state.settings?.turnTimerEnabled) {
      turnTimerEl.textContent = `Turn: ${state.turnTimeRemaining !== undefined ? state.turnTimeRemaining : '--'}s`;
      if (state.turnTimeRemaining <= 3) {
        turnTimerEl.classList.add('urgent');
      } else {
        turnTimerEl.classList.remove('urgent');
      }
    }

    // Update state reference but skip full render
    previousGameState = JSON.parse(JSON.stringify(state));
    gameState = state;
    return;
  }

  previousGameState = JSON.parse(JSON.stringify(state)); // Deep copy for comparison
  gameState = state;
  render();
});

function render() {
  if (gameState.gameState === 'LOBBY') {
    renderLobby();
  } else if (gameState.gameState === 'HOSTING') {
    renderHosting();
  } else {
    renderGame();
  }
}

function renderLobby() {
  app.innerHTML = `
    <div class="lobby-container">
      <div class="lobby-card">
        <h1 class="lobby-title">UNO</h1>
        <div class="lobby-form">
          <input type="text" id="player-name" placeholder="Enter your name" value="Player 1" maxlength="10">
          
          <button id="create-btn" class="primary-btn">Create Game</button>

          <div class="divider"><span>OR</span></div>
          
          <input type="text" id="room-code" placeholder="Enter 4-Digit Code" maxlength="4">
          <button id="join-btn" class="secondary-btn">Join Game</button>
          
          <div id="lobby-status" class="status-message"></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('create-btn').addEventListener('click', () => {
    soundManager.playCardPlace();
    console.log('Create button clicked');
    const nameInput = document.getElementById('player-name');
    const name = nameInput.value.trim() || 'Player 1';

    console.log('Emitting createGame with name:', name);
    socket.emit('createGame', name, (response) => {
      console.log('createGame response:', response);
      if (response.error) {
        showStatus(response.error, 'error');
      } else {
        myPlayerIndex = response.playerIndex;
        render();
      }
    });
  });

  const joinBtn = document.getElementById('join-btn');
  const statusEl = document.getElementById('lobby-status');

  if (joinBtn) {
    joinBtn.addEventListener('click', () => {
      soundManager.playCardPlace();
      const nameInput = document.getElementById('player-name');
      const codeInput = document.getElementById('room-code');
      const name = nameInput.value.trim() || 'Player 1';
      const code = codeInput.value.trim().toUpperCase();

      if (code.length === 0) {
        showStatus('Please enter a room code!', 'error');
        return;
      }

      showStatus(`Joining room ${code} as ${name}...`, 'success');

      socket.emit('joinGame', { roomCode: code, playerName: name }, (response) => {
        if (response.error) {
          showStatus(response.error, 'error');
        } else {
          myPlayerIndex = response.playerIndex;
          render();
        }
      });
    });
  }

  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = `status-message ${type}`;
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status-message';
    }, 3000);
  }
}

function renderHosting() {
  app.innerHTML = `
    <div class="lobby-container">
      <div class="lobby-card">
        <h1 class="lobby-title">LOBBY</h1>
        <div class="room-info">
            <div class="room-code-label">ROOM CODE</div>
            <div class="room-code-display">${gameState.roomCode}</div>
        </div>
        
        <div class="player-list">
            <div class="list-header">
                <h3>Players</h3>
                ${myPlayerIndex === 0 ? '<button id="settings-btn" class="icon-btn">⚙️</button>' : ''}
            </div>
            ${gameState.players.map((p, i) => `<div class="player-item">${p.name} ${i === 0 ? '(Host)' : ''} ${i === myPlayerIndex ? '(You)' : ''}</div>`).join('')}
        </div>

        ${myPlayerIndex === 0 ? '<button id="start-game-btn" class="primary-btn">Start Game</button>' : '<div class="waiting-msg">Waiting for host to start...</div>'}
      </div>
      
      <!-- Settings Modal -->
      <div id="settings-modal" class="modal-overlay" style="display: none;">
        <div class="modal-content settings-content">
            <button class="close-modal-btn" id="close-settings">×</button>
            <h2>Game Settings</h2>
            
            <div class="setting-group">
                <label>
                    <input type="checkbox" id="game-timer-toggle" ${gameState.settings?.gameTimerEnabled ? 'checked' : ''}>
                    Enable Game Timer
                </label>
                <div class="setting-input" id="game-timer-input-group" style="${gameState.settings?.gameTimerEnabled ? '' : 'display:none'}">
                    <input type="number" id="game-time-input" value="${(gameState.settings?.gameTimeSeconds || 300) / 60}" min="1" max="60">
                    <span>minutes</span>
                </div>
            </div>

            <div class="setting-group">
                <label>
                    <input type="checkbox" id="turn-timer-toggle" ${gameState.settings?.turnTimerEnabled ? 'checked' : ''}>
                    Enable Turn Timer
                </label>
                <div class="setting-input" id="turn-timer-input-group" style="${gameState.settings?.turnTimerEnabled ? '' : 'display:none'}">
                    <input type="number" id="turn-time-input" value="${gameState.settings?.turnTimeSeconds || 10}" min="5" max="60">
                    <span>seconds</span>
                </div>
            </div>

            <button id="save-settings-btn" class="primary-btn">Save Settings</button>
        </div>
      </div>
    </div>
  `;

  const startBtn = document.getElementById('start-game-btn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      soundManager.playCardPlace();
      socket.emit('startGame');
    });
  }

  // Settings Logic
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const closeSettingsBtn = document.getElementById('close-settings');
  const saveSettingsBtn = document.getElementById('save-settings-btn');

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      settingsModal.style.display = 'flex';
    });

    closeSettingsBtn.addEventListener('click', () => {
      settingsModal.style.display = 'none';
    });

    // Toggles
    document.getElementById('game-timer-toggle').addEventListener('change', (e) => {
      document.getElementById('game-timer-input-group').style.display = e.target.checked ? 'flex' : 'none';
    });
    document.getElementById('turn-timer-toggle').addEventListener('change', (e) => {
      document.getElementById('turn-timer-input-group').style.display = e.target.checked ? 'flex' : 'none';
    });

    saveSettingsBtn.addEventListener('click', () => {
      const newSettings = {
        gameTimerEnabled: document.getElementById('game-timer-toggle').checked,
        gameTimeSeconds: parseInt(document.getElementById('game-time-input').value) * 60,
        turnTimerEnabled: document.getElementById('turn-timer-toggle').checked,
        turnTimeSeconds: parseInt(document.getElementById('turn-time-input').value)
      };
      socket.emit('updateSettings', newSettings);
      settingsModal.style.display = 'none';
    });
  }
}

function renderGame() {
  if (!gameState.topCard) return;

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const myPlayer = gameState.players[myPlayerIndex];
  const isMyTurn = gameState.currentPlayerIndex === myPlayerIndex;

  app.innerHTML = `
    <div class="game-container">
      <div class="header">
        <div class="logo">UNO</div>
        <div class="timer-container">
            ${gameState.settings?.gameTimerEnabled ? `<div class="game-timer">Game: ${formatTime(gameState.gameTimeRemaining)}</div>` : ''}
            ${gameState.settings?.turnTimerEnabled ? `<div class="turn-timer ${gameState.turnTimeRemaining <= 3 ? 'urgent' : ''}">Turn: ${gameState.turnTimeRemaining !== undefined ? gameState.turnTimeRemaining : '--'}s</div>` : ''}
        </div>
        <div class="status-bar">
            <div class="message">${gameState.message}</div>
            <div class="turn-indicator ${isMyTurn ? 'your-turn' : ''}">
                ${isMyTurn ? "Your Turn" : `${currentPlayer.name}'s Turn`}
            </div>
        </div>
        <div class="current-color-indicator" style="background-color: ${getColorHex(gameState.currentColor)}">
            <span class="color-label">Current Color</span>
        </div>
      </div>

      <div class="opponents">
        ${gameState.players.map((p, i) => {
    if (i === myPlayerIndex) return ''; // Skip self
    const isActive = i === gameState.currentPlayerIndex;
    return `
              <div class="opponent ${isActive ? 'active' : ''}">
                <div class="avatar">👤</div>
                <div class="opponent-info">
                    <div class="name">${p.name}</div>
                    <div class="card-count-badge">
                        <span class="count">${p.handCount || p.hand.length}</span>
                        <span class="label">Cards</span>
                    </div>
                </div>
              </div>
            `;
  }).join('')}
      </div>

      <div class="center-area">
        <div class="deck-area" id="draw-pile">
          <div class="card back">
            <div class="card-inner">
              <div class="card-oval"></div>
              <span class="uno-text">UNO</span>
            </div>
          </div>
          <div class="deck-label">Draw</div>
        </div>
        
        <div class="discard-area">
          ${renderCard(gameState.topCard, true, (gameState.topCard.color === 'black' && gameState.currentColor) ? gameState.currentColor : null)}
          <div class="discard-label">Discard</div>
        </div>
      </div>

      <div class="player-area ${isMyTurn ? 'active' : ''}">
        <div class="hand">
          ${myPlayer.hand.map((card, idx) => {
    const isPlayable = isMyTurn && (
      card.color === 'black' ||
      card.color === gameState.currentColor ||
      card.type === gameState.topCard.type
    );
    return `
                <div class="card-wrapper ${isPlayable ? 'playable' : 'not-playable'}" data-idx="${idx}">
                    ${renderCard(card)}
                </div>
              `}).join('')}
        </div>
      </div>
      
      ${gameState.gameOver ? `
        <div class="modal-overlay">
            <div class="modal-content">
                <h2>${gameState.winner} Wins!</h2>
                <button class="restart-btn" onclick="location.reload()">Play Again</button>
            </div>
        </div>
      ` : ''}

      ${pendingWildCardIdx !== null ? `
        <div class="modal-overlay">
            <div class="modal-content">
                <button class="close-modal-btn" id="close-color-picker">×</button>
                <h2>Choose a Color</h2>
                <div class="color-options">
                    <div class="color-option red" data-color="red"></div>
                    <div class="color-option blue" data-color="blue"></div>
                    <div class="color-option green" data-color="green"></div>
                    <div class="color-option yellow" data-color="yellow"></div>
                </div>
            </div>
        </div>
      ` : ''}
    </div>
  `;

  // Re-attach event listeners
  document.querySelectorAll('.card-wrapper').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      handleCardClick(idx);
    });

    // Hover Sound
    el.addEventListener('mouseenter', () => {
      if (el.classList.contains('playable')) {
        soundManager.playHover();
      }
    });
  });

  const closePickerBtn = document.getElementById('close-color-picker');
  if (closePickerBtn) {
    closePickerBtn.addEventListener('click', () => {
      pendingWildCardIdx = null;
      render();
    });
  }

  const drawPile = document.getElementById('draw-pile');
  if (drawPile) {
    drawPile.addEventListener('click', () => {
      if (isMyTurn) {
        socket.emit('drawCard');
      }
    });
  }

  // Color picker listeners
  document.querySelectorAll('.color-option').forEach(el => {
    el.addEventListener('click', (e) => {
      pickColor(e.target.dataset.color);
    });
  });
}

function renderCard(card, isBig = false, overrideColor = null) {
  const colorHex = getColorHex(overrideColor || card.color);
  const isWild = card.color === 'black';

  let centerContent = '';
  const type = card.type;

  // Center Content Logic
  if (type === 'draw2') {
    centerContent = `
      <div class="card-icon draw2">
        <div class="mini-card offset-1"></div>
        <div class="mini-card offset-2"></div>
      </div>
    `;
  } else if (type === 'wild4') {
    centerContent = `
      <div class="card-icon wild4">
        <div class="mini-card wild-blue offset-1"></div>
        <div class="mini-card wild-green offset-2"></div>
        <div class="mini-card wild-red offset-3"></div>
        <div class="mini-card wild-yellow offset-4"></div>
      </div>
    `;
  } else if (type === 'skip') {
    centerContent = `<div class="card-icon skip-icon"></div>`;
  } else if (type === 'reverse') {
    centerContent = `
      <svg viewBox="0 0 24 24" class="card-icon reverse-icon">
        <path fill="currentColor" d="M21 9l-4-4v3h-7a3 3 0 0 0-3 3v5h2v-5a1 1 0 0 1 1-1h7v3l4-4zm-18 6l4 4v-3h7a3 3 0 0 0 3-3v-5h-2v5a1 1 0 0 1-1 1h-7v-3l-4 4z"/>
      </svg>
    `;
  } else if (type === 'wild') {
    centerContent = `
      <div class="card-icon wild-icon">
        <div class="wild-segment red"></div>
        <div class="wild-segment blue"></div>
        <div class="wild-segment green"></div>
        <div class="wild-segment yellow"></div>
      </div>
    `;
  } else if (type === 'wild_discard_all') {
    centerContent = `
      <div class="wild-discard-all-icon">
        <div class="card-stack">
            <div class="stack-card"></div>
            <div class="stack-card"></div>
            <div class="stack-card"></div>
        </div>
        <div class="arrow-down"></div>
      </div>
    `;
  } else if (type === 'discard_all') {
    centerContent = `
      <div class="discard-all-icon">
        <div class="card-fan">
          <div class="fan-card"></div>
          <div class="fan-card"></div>
          <div class="fan-card"></div>
          <div class="fan-card"></div>
        </div>
        <div class="arrow-curved"></div>
      </div>
    `;
  } else {
    centerContent = `<div class="card-center-number">${type}</div>`;
  }

  // Corner Symbol Logic
  let cornerDisplay = type;
  if (type === 'draw2') cornerDisplay = '+2';
  if (type === 'wild4') cornerDisplay = '+4';
  if (type === 'skip') cornerDisplay = '⊘';
  if (type === 'reverse') cornerDisplay = '⇄';
  if (type === 'wild') cornerDisplay = '';
  if (type === 'wild_discard_all') cornerDisplay = 'D';
  if (type === 'discard_all') cornerDisplay = 'M';

  return `
        <div class="card ${isBig ? 'large' : ''} ${isWild ? 'wild' : ''}" style="--card-color: ${colorHex}">
            <div class="card-inner">
                <div class="card-oval"></div>
                <div class="card-corner top-left">${cornerDisplay}</div>
                <div class="card-content-wrapper">
                    ${centerContent}
                </div>
                <div class="card-corner bottom-right">${cornerDisplay}</div>
            </div>
        </div>
    `;
}

function getColorHex(color) {
  const map = {
    red: '#E93D3D',
    blue: '#0063B3',
    green: '#4DA136',
    yellow: '#F5C400',
    black: '#1C1C1C'
  };
  return map[color] || '#1C1C1C';
}

function formatType(type) {
  // Helper for text-only contexts if needed, but renderCard handles HTML now
  if (type === 'wild') return 'Wild';
  if (type === 'wild4') return '+4';
  if (type === 'draw2') return '+2';
  if (type === 'skip') return 'Skip';
  if (type === 'reverse') return 'Reverse';
  return type;
}

function handleCardClick(idx) {
  if (pendingWildCardIdx !== null) return;
  if (gameState.currentPlayerIndex !== myPlayerIndex) return;

  const card = gameState.players[myPlayerIndex].hand[idx];

  if (card.color !== 'black' && card.color !== gameState.currentColor && card.type !== gameState.topCard.type) {
    return;
  }

  if (card.type === 'wild' || card.type === 'wild4' || card.type === 'wild_discard_all') {
    pendingWildCardIdx = idx;
    render();
  } else {
    socket.emit('playCard', { cardIndex: idx, wildColor: null });
  }
}

function pickColor(color) {
  if (pendingWildCardIdx !== null) {
    socket.emit('playCard', { cardIndex: pendingWildCardIdx, wildColor: color });
    pendingWildCardIdx = null;
    render();
  }
}

function formatTime(seconds) {
  if (seconds === undefined) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

render();
