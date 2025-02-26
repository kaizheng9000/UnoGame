const Deck = require('../Models/UnoDeck');

class GameController {
  constructor() {
    this.deck = new Deck();
    this.players = {};
  }

  getDeck() {
    return this.deck;
  }
}

module.exports = new GameController();
