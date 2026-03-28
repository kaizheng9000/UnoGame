import type { UnoCard } from '../../shared/types';

export function isBotId(id: string): boolean {
  return id.startsWith('bot_');
}

/** Pick the best card for the bot to play, or null if none is playable. */
export function chooseBotCard(hand: UnoCard[], topCard: UnoCard): UnoCard | null {
  const playable = hand.filter(
    c => c.type === 'wild' || c.color === topCard.color || c.value === topCard.value
  );
  if (playable.length === 0) return null;

  // Prefer action cards matching color, then number matching color,
  // then any action, then any number, then wilds last.
  return (
    playable.find(c => c.type === 'action' && c.color === topCard.color) ??
    playable.find(c => c.type === 'number' && c.color === topCard.color) ??
    playable.find(c => c.type === 'action') ??
    playable.find(c => c.type === 'number') ??
    playable[0]
  );
}

/** Choose the color the bot has the most of (for wild cards). */
export function chooseBotWildColor(hand: UnoCard[]): string {
  const counts: Record<string, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
  hand.forEach(c => { if (c.color in counts) counts[c.color]++; });
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : 'red';
}
