import Deck from '../models/unoDeck.js';
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
