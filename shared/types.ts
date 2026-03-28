export interface UnoCard {
  color: string;
  value: number | string;
  type: 'number' | 'action' | 'wild';
}

export interface PlayerInfo {
  id: string;
  name: string;
  cardCount: number;
}

export interface FullGameState {
  deckCards: UnoCard[];
  discardPile: UnoCard[];
  currentTurn: string;
  players: { id: string; name: string }[];
  hands: Record<string, UnoCard[]>;
  direction: 1 | -1;
}
