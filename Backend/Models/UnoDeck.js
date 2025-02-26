class UnoDeck {
    constructor() {
        this.cards = this.generateDeck();
        this.shuffle();
    }

    generateDeck() {
        const colors = ["red", "blue", "green", "yellow"];
        const specialCards = ["skip", "reverse", "draw two"];
        const wildCards = ["wild", "wild draw four"];
        let deck = [];

        colors.forEach(color => {
            deck.push({ color, value: 0, type: "number" });
            for (let i = 1; i <= 9; i++) {
                deck.push({ color, value: i, type: "number" });
                deck.push({ color, value: i, type: "number" });
            }
            specialCards.forEach(action => {
                deck.push({ color, value: action, type: "action" });
                deck.push({ color, value: action, type: "action" });
            });
        });

        wildCards.forEach(wild => {
            for (let i = 0; i < 4; i++) {
                deck.push({ color: "wild", value: wild, type: "wild" });
            }
        });

        return deck;
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    drawCard() {
        return this.cards.pop();
    }
}

module.exports = UnoDeck;