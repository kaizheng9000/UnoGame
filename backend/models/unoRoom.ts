import UnoDeck, {UnoCard} from "./unoDeck";
import Player from "./player";

class UnoRoom{
    id: string;
    hostid: string;
    roomCode: string;
    deck: UnoDeck;
    players: string[];
    currentPlayersTurn: number;
    discardPile: UnoCard[];

    constructor(id: string, hostid: string, roomCode = '') {
        this.id = id;
        this.hostid = hostid;
        this.deck = new UnoDeck();
        this.players = [hostid];
        this.roomCode = roomCode;
        this.currentPlayersTurn = 0;
        this.discardPile = []
    }

    addPlayer(id: string) {
        if (this.players.length < 8 && this.players.includes(id) === false) {
            this.players.push(id);
            return true;
        }
        return Error("Room is full or player already exists");
    }

    #removePlayer(player: string) {
        const index = this.players.indexOf(player);
        if (index > -1) {
            this.players.splice(index, 1);
            return true;
        }
        return Error("Player not found in room");
    }

    #getCurrentPlayer() {
        return this.players[this.currentPlayersTurn];
    }

    getNextPlayer() {
        this.currentPlayersTurn = (this.currentPlayersTurn + 1) % this.players.length;
        return this.#getCurrentPlayer();
    }

    getTopCard() {
        if (this.discardPile.length === 0) {
            return null;
        }
        return this.discardPile[this.discardPile.length - 1];
    }

    leaveRoom(player: string) {
        if (this.hostid === player) {
            this.players.forEach(player => this.#removePlayer(player));
            return true;
        }
        return this.#removePlayer(player);
    }

    #validatePlay(player: Player, card: UnoCard) {
        const topCard = this.getTopCard();
        if (topCard != null){
            if (this.#getCurrentPlayer() === player.id && (card.color === topCard.color || card.value === topCard.value)) {
                this.discardPile.push(card);
                return true;
            }
        }
        return false;
    }
    
    acceptPlay(player: Player, card: UnoCard) {
        if (this.#validatePlay(player, card)) {
            player.playCard(card);
            this.getNextPlayer();
            return true;
        }
        return false;
    }
}

export default UnoRoom;
