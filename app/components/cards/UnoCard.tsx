import type { UnoCard } from '../../../shared/types';

export type CardSize = 'sm' | 'md' | 'lg';

export const CARD_W = 70;
export const CARD_H = 100;

// Used for color picker swatches and backgrounds
export const CARD_COLORS: Record<string, string> = {
  red: '#ff2255', blue: '#00aaff', green: '#22cc44', yellow: '#ffcc00', wild: '#9d00ff',
};

// Darker versions used for text inside the white oval — readable on light bg
const CARD_TEXT_COLORS: Record<string, string> = {
  red: '#aa0022', blue: '#0055bb', green: '#116622', yellow: '#7a5500', wild: '#4a0099',
};

export const CARD_GRADIENTS: Record<string, string> = {
  red:    'linear-gradient(145deg, #ff3366 0%, #cc0033 100%)',
  blue:   'linear-gradient(145deg, #00bbff 0%, #0055cc 100%)',
  green:  'linear-gradient(145deg, #33dd55 0%, #118833 100%)',
  yellow: 'linear-gradient(145deg, #ffdd00 0%, #bb8800 100%)',
  wild:   'linear-gradient(145deg, #cc00ff 0%, #550099 100%)',
};

const WILD_QUAD_COLORS = ['#ff2255', '#00aaff', '#22cc44', '#ffcc00'];

export const DIMS = {
  lg: { w: 90,      h: 130,     fs: 28, cornerFs: 9, cornerPad: 5, ovalW: 54, ovalH: 78 },
  md: { w: CARD_W,  h: CARD_H,  fs: 22, cornerFs: 8, cornerPad: 4, ovalW: 42, ovalH: 60 },
  sm: { w: 44,      h: 64,      fs: 14, cornerFs: 6, cornerPad: 3, ovalW: 26, ovalH: 38 },
};

function cardCenterLabel(card: UnoCard): string {
  if (typeof card.value === 'number') return String(card.value);
  switch (card.value) {
    case 'skip':           return '⊘';
    case 'reverse':        return '⇄';
    case 'draw two':       return '+2';
    case 'wild':           return '★';
    case 'wild draw four': return '+4';
    default:               return String(card.value);
  }
}

function cardCornerLabel(card: UnoCard): string {
  if (typeof card.value === 'number') return String(card.value);
  switch (card.value) {
    case 'skip':           return '⊘';
    case 'reverse':        return '⇄';
    case 'draw two':       return '+2';
    case 'wild':           return 'W';
    case 'wild draw four': return 'W+4';
    default:               return String(card.value);
  }
}

function WildPattern({ size }: { size: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden',
      display: 'grid', gridTemplateColumns: '1fr 1fr', flexShrink: 0,
    }}>
      {WILD_QUAD_COLORS.map((c, i) => (
        <div key={i} style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}

export function UnoCardFace({ card, size = 'md' }: { card: UnoCard; size?: CardSize }) {
  const isWild = card.type === 'wild';
  const dims = DIMS[size];
  const bg = CARD_GRADIENTS[card.color] ?? CARD_GRADIENTS.wild;
  const label = cardCenterLabel(card);
  const corner = cardCornerLabel(card);

  return (
    <div style={{
      width: dims.w, height: dims.h,
      background: bg,
      borderRadius: 10,
      border: '2.5px solid rgba(255,255,255,0.9)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
      position: 'relative', flexShrink: 0, overflow: 'hidden',
    }}>
      {/* Gloss overlay */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)',
        borderRadius: '10px 10px 0 0', pointerEvents: 'none',
      }} />

      {/* Top-left corner */}
      <div style={{
        position: 'absolute', top: dims.cornerPad, left: dims.cornerPad + 1,
        color: 'white', fontWeight: 900, fontSize: dims.cornerFs,
        textShadow: '0 1px 3px rgba(0,0,0,0.7)', lineHeight: 1,
      }}>{corner}</div>

      {/* Bottom-right corner (rotated) */}
      <div style={{
        position: 'absolute', bottom: dims.cornerPad, right: dims.cornerPad + 1,
        color: 'white', fontWeight: 900, fontSize: dims.cornerFs,
        textShadow: '0 1px 3px rgba(0,0,0,0.7)', lineHeight: 1,
        transform: 'rotate(180deg)',
      }}>{corner}</div>

      {/* Center oval */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%) rotate(-25deg)',
        width: dims.ovalW, height: dims.ovalH,
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      }}>
        <div style={{ transform: 'rotate(25deg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          {isWild ? (
            <>
              <WildPattern size={dims.ovalW * 0.62} />
              {card.value === 'wild draw four' && (
                <span style={{
                  color: '#330066', fontWeight: 900,
                  fontSize: dims.fs * 0.55, lineHeight: 1,
                }}>+4</span>
              )}
            </>
          ) : (
            <span style={{
              color: CARD_TEXT_COLORS[card.color] ?? '#1e1b4b',
              fontWeight: 900, fontSize: dims.fs,
              lineHeight: 1,
            }}>{label}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function CardBack({ size = 'md' }: { size?: CardSize }) {
  const dims = DIMS[size];
  return (
    <div style={{
      width: dims.w, height: dims.h,
      background: 'linear-gradient(145deg, #312e81 0%, #1e1b4b 100%)',
      borderRadius: 10, border: '2.5px solid rgba(255,255,255,0.9)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%)',
        borderRadius: '10px 10px 0 0',
      }} />
      <div style={{
        width: dims.w * 0.62, height: dims.h * 0.6,
        background: 'linear-gradient(145deg, #ff2d6a, #9d00ff)',
        borderRadius: '50%', transform: 'rotate(-25deg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        border: '2px solid rgba(255,255,255,0.5)',
      }}>
        <span style={{
          transform: 'rotate(25deg)',
          color: 'white', fontWeight: 900, fontSize: dims.fs * 0.47,
          fontStyle: 'italic', letterSpacing: '0.05em',
          textShadow: '0 1px 4px rgba(0,0,0,0.5)',
        }}>UNO</span>
      </div>
    </div>
  );
}
