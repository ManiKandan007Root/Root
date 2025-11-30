import { COLORS, SPECIAL_CARDS, WILD_CARDS } from './constants.js';

export class Deck {
    constructor() {
        this.cards = [];
        this.reset();
    }

    reset() {
        this.cards = [];
        let id = 0;

        COLORS.forEach(color => {
            // Number 0 (1 per color)
            this.cards.push({ id: id++, color, type: '0', value: 0 });

            // Numbers 1-9 (2 per color)
            for (let i = 1; i <= 9; i++) {
                this.cards.push({ id: id++, color, type: String(i), value: i });
                this.cards.push({ id: id++, color, type: String(i), value: i });
            }

            // Special cards (2 per color)
            SPECIAL_CARDS.forEach(type => {
                this.cards.push({ id: id++, color, type, value: 20 });
                this.cards.push({ id: id++, color, type, value: 20 });
            });
        });

        // Wild cards (4 each)
        // Wild cards
        WILD_CARDS.forEach(type => {
            const count = type === 'wild_discard_all' ? 2 : 4;
            for (let i = 0; i < count; i++) {
                this.cards.push({ id: id++, color: 'black', type, value: 50 }); // Using 'black' for wild base color
            }
        });
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    draw() {
        return this.cards.pop();
    }

    get count() {
        return this.cards.length;
    }
}
