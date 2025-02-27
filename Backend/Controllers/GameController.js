import Deck from '../Models/UnoDeck.js';
class GameController {
  constructor() {
    this.deck = new Deck();
    this.players = {};
  }

  getDeck() {
    return this.deck;
  }
}

export default GameController;
