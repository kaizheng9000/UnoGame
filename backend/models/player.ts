import { UnoCard } from "./unoDeck";

class Player{

    id: string;
    name: string;
    currentHand: UnoCard[] = [];

    constructor(id: string, name: string) {
        this.id = id;
        this.name = name;
    }

    addCard(card: UnoCard) {
        this.currentHand.push(card);
    }   

    removeCard(card: UnoCard) {
        const index = this.currentHand.indexOf(card);
        if (index > -1) {
            this.currentHand.splice(index, 1);
            return true;
        }
        return false;
    }

    playCard(card: UnoCard) {
        if (this.currentHand.includes(card)) {
            this.removeCard(card);
            return true;
        }
        return false;
    }
}

export default Player;