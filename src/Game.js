import { Deck } from './Deck.js';
import { Player } from './Player.js';

export class Game {
    constructor() {
        this.deck = new Deck();
        this.players = [];
        this.currentPlayerIndex = 0;
        this.direction = 1; // 1 or -1
        this.topCard = null;
        this.currentColor = null;
        this.gameState = 'LOBBY'; // LOBBY, PLAYING, GAME_OVER
        this.gameOver = false;
        this.winner = null;
        this.message = 'Welcome to Uno!';
        this.updateUI = () => { };

        // Timers
        this.gameTimeRemaining = 300; // 5 minutes in seconds
        this.turnTimeRemaining = 10; // 10 seconds per turn
        this.gameInterval = null;
        this.turnInterval = null;

        // Settings
        this.settings = {
            gameTimerEnabled: true,
            gameTimeSeconds: 300,
            turnTimerEnabled: true,
            turnTimeSeconds: 10
        };
    }

    hostGame(playerName, roomCode) {
        this.gameState = 'HOSTING';
        this.roomCode = roomCode;
        this.players = [new Player(playerName, false)];
        this.message = `Waiting for players... Room Code: ${this.roomCode}`;
        this.updateUI();
    }

    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.updateUI();
    }

    startGame() {
        this.gameState = 'PLAYING';
        this.deck.reset(); // Ensure deck is fresh
        this.deck.shuffle();

        // If single player (testing), add bots
        if (this.players.length === 1) {
            this.players.push(new Player('Bot 1', true));
            this.players.push(new Player('Bot 2', true));
            this.players.push(new Player('Bot 3', true));
        }

        // Deal 7 cards to each
        this.players.forEach(p => p.draw(this.deck, 7));

        // Flip top card
        do {
            this.topCard = this.deck.draw();
        } while (this.topCard.color === 'black'); // Ensure start card is not wild

        this.currentColor = this.topCard.color;

        // Apply settings
        this.gameTimeRemaining = this.settings.gameTimeSeconds;
        this.turnTimeRemaining = this.settings.turnTimeSeconds;

        this.startTimers();
        this.updateUI();
    }

    startTimers() {
        // Clear existing
        if (this.gameInterval) clearInterval(this.gameInterval);
        if (this.turnInterval) clearInterval(this.turnInterval);

        // Game Timer
        if (this.settings.gameTimerEnabled) {
            this.gameInterval = setInterval(() => {
                if (this.gameOver) {
                    clearInterval(this.gameInterval);
                    return;
                }
                this.gameTimeRemaining--;
                if (this.gameTimeRemaining <= 0) {
                    this.endGameByTime();
                }
                this.updateUI();
            }, 1000);
        }

        this.startTurnTimer();
    }

    startTurnTimer() {
        if (this.turnInterval) clearInterval(this.turnInterval);

        if (!this.settings.turnTimerEnabled) return;

        this.turnTimeRemaining = this.settings.turnTimeSeconds;

        this.turnInterval = setInterval(() => {
            if (this.gameOver) {
                clearInterval(this.turnInterval);
                return;
            }
            this.turnTimeRemaining--;

            if (this.turnTimeRemaining <= 0) {
                this.handleTurnTimeout();
            }
        }, 1000);
    }

    handleTurnTimeout() {
        clearInterval(this.turnInterval);
        const player = this.players[this.currentPlayerIndex];
        this.message = `${player.name} ran out of time! Drawing card...`;
        this.drawCard(player); // This will trigger nextTurn()
    }

    endGameByTime() {
        this.gameOver = true;
        clearInterval(this.gameInterval);
        clearInterval(this.turnInterval);

        // Determine winner by lowest hand count
        let winner = this.players[0];
        let minCards = 1000;

        this.players.forEach(p => {
            if (p.hand.length < minCards) {
                minCards = p.hand.length;
                winner = p;
            }
        });

        this.winner = winner;
        this.message = `Time's Up! ${winner.name} wins with fewest cards!`;
        this.updateUI();
    }

    nextTurn() {
        if (this.gameOver) return;

        this.currentPlayerIndex = (this.currentPlayerIndex + this.direction + this.players.length) % this.players.length;

        const player = this.players[this.currentPlayerIndex];

        // Reset turn timer for new player
        this.startTurnTimer();

        this.updateUI();

        if (player.isComputer) {
            // Delay slightly less than turn timer to ensure they play
            setTimeout(() => this.playComputerTurn(), 1500);
        }
    }

    playComputerTurn() {
        if (this.gameOver) return;
        const player = this.players[this.currentPlayerIndex];
        const cardIdx = player.findPlayableCard(this.topCard, this.currentColor);

        if (cardIdx !== -1) {
            const card = player.hand[cardIdx];
            // Choose color for wild
            let chosenColor = this.currentColor;
            if (card.color === 'black') {
                const counts = { red: 0, green: 0, blue: 0, yellow: 0 };
                player.hand.forEach(c => { if (c.color !== 'black') counts[c.color]++; });
                chosenColor = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
            }
            this.playCard(player, cardIdx, chosenColor);
        } else {
            this.drawCard(player);
        }
    }

    playCard(player, cardIdx, wildColorChoice = null) {
        // Clear turn timer as they played
        if (this.turnInterval) clearInterval(this.turnInterval);

        const card = player.play(cardIdx);
        this.topCard = card;
        this.currentColor = (card.color === 'black') ? wildColorChoice : card.color;

        this.message = `${player.name} played ${card.color === 'black' ? 'Wild' : card.color} ${card.type}`;

        // Check Win
        if (player.hand.length === 0) {
            this.gameOver = true;
            this.winner = player;
            this.message = `${player.name} Wins!`;
            clearInterval(this.gameInterval); // Stop game timer
            this.updateUI();
            return;
        }

        // Effects
        let skipNext = false;
        if (card.type === 'skip') {
            skipNext = true;
        } else if (card.type === 'reverse') {
            this.direction *= -1;
            if (this.players.length === 2) skipNext = true;
        } else if (card.type === 'draw2') {
            const nextPlayerIndex = (this.currentPlayerIndex + this.direction + this.players.length) % this.players.length;
            this.players[nextPlayerIndex].draw(this.deck, 2);
            skipNext = true;
        } else if (card.type === 'wild4') {
            const nextPlayerIndex = (this.currentPlayerIndex + this.direction + this.players.length) % this.players.length;
            this.players[nextPlayerIndex].draw(this.deck, 4);
            skipNext = true;
        } else if (card.type === 'wild_discard_all') {
            // Discard all cards of the chosen color
            for (let i = player.hand.length - 1; i >= 0; i--) {
                if (player.hand[i].color === this.currentColor) {
                    player.hand.splice(i, 1);
                }
            }

            // Check Win again (in case they discarded their last cards)
            if (player.hand.length === 0) {
                this.gameOver = true;
                this.winner = player;
                this.message = `${player.name} Wins!`;
                clearInterval(this.gameInterval);
                this.updateUI();
                return;
            }
        } else if (card.type === 'discard_all') {
            // Discard all other cards of the same color
            for (let i = player.hand.length - 1; i >= 0; i--) {
                if (player.hand[i].color === card.color) {
                    player.hand.splice(i, 1);
                }
            }

            // Check Win again
            if (player.hand.length === 0) {
                this.gameOver = true;
                this.winner = player;
                this.message = `${player.name} Wins!`;
                clearInterval(this.gameInterval);
                this.updateUI();
                return;
            }
        }

        if (skipNext) {
            this.currentPlayerIndex = (this.currentPlayerIndex + this.direction + this.players.length) % this.players.length;
        }

        this.updateUI();
        this.nextTurn();
    }

    drawCard(player) {
        // Clear turn timer if it was running (e.g. voluntary draw)
        if (this.turnInterval) clearInterval(this.turnInterval);

        player.draw(this.deck, 1);
        this.message = `${player.name} drew a card`;
        this.updateUI();
        this.nextTurn();
    }

    humanPlay(cardIndex, wildColor = null) {
        if (this.players[this.currentPlayerIndex].isComputer) return;
        const player = this.players[this.currentPlayerIndex];
        const card = player.hand[cardIndex];

        // Validate
        if (card.color !== 'black' && card.color !== this.currentColor && card.type !== this.topCard.type) {
            // Invalid move
            return false;
        }

        this.playCard(player, cardIndex, wildColor);
        return true;
    }

    humanDraw() {
        if (this.players[this.currentPlayerIndex].isComputer) return;
        this.drawCard(this.players[this.currentPlayerIndex]);
    }

    setUpdateCallback(cb) {
        this.updateUI = cb;
    }
}
