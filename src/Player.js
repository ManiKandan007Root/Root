export class Player {
    constructor(name, isComputer = false) {
        this.name = name;
        this.isComputer = isComputer;
        this.hand = [];
    }

    draw(deck, count = 1) {
        for (let i = 0; i < count; i++) {
            const card = deck.draw();
            if (card) this.hand.push(card);
        }
    }

    play(cardIndex) {
        return this.hand.splice(cardIndex, 1)[0];
    }

    // Returns index of playable card, or -1 if none
    findPlayableCard(topCard, currentColor) {
        // AI Strategy: Try to keep Wilds for later? Or just play first available?
        // Let's play matching color first, then matching number, then wild.

        // 1. Match Color
        let idx = this.hand.findIndex(c => c.color === currentColor);
        if (idx !== -1) return idx;

        // 2. Match Type/Value (if not wild)
        idx = this.hand.findIndex(c => c.type === topCard.type && c.color !== 'black');
        if (idx !== -1) return idx;

        // 3. Wilds
        idx = this.hand.findIndex(c => c.type === 'wild' || c.type === 'wild4' || c.type === 'wild_discard_all');
        if (idx !== -1) return idx;

        return -1;
    }
}
