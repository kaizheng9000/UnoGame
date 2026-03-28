import { useLocation, useNavigate } from '@remix-run/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MantineProvider, Text, Button, Group, Modal, Stack } from '@mantine/core';
import socket from '../../backend/socket';
import type { UnoCard } from '../../shared/types';
import { UnoCardFace, CardBack, CARD_COLORS, DIMS } from '../components/cards/UnoCard';
import { useBreakpoint } from '../hooks/useBreakpoint';

interface PlayerInfo { id: string; name: string; cardCount: number; }
interface GameState {
  hand: UnoCard[]; topCard: UnoCard; currentTurn: string;
  deckCount: number; discardCount: number; players: PlayerInfo[]; myId: string;
  roomCode: string; playerName: string;
}
interface ClientCard extends UnoCard { _id: string; }

const WILD_COLORS = ['red', 'blue', 'green', 'yellow'] as const;

// Compute arc positions for a fan of n cards.
// maxW constrains the fan radius so it fits within available width.
function computeFanLayout(n: number, cw: number, ch: number, idealRadius: number, maxAngle: number, maxW = 9999) {
  if (n === 0) return { positions: [] as { angle: number; x: number; y: number }[], containerW: cw + 20, containerH: ch + 10 };
  const totalAngle = Math.min(maxAngle, n * 9);
  const halfRad = (totalAngle / 2) * Math.PI / 180;
  const sinHalf = Math.sin(halfRad);
  const fanRadius = sinHalf > 0 ? Math.min(idealRadius, (maxW - cw - 16) / (2 * sinHalf)) : idealRadius;
  const arcDrop = fanRadius * (1 - Math.cos(halfRad));
  const containerW = Math.ceil(2 * fanRadius * sinHalf + cw + 16);
  const containerH = Math.ceil(ch + arcDrop + 8);
  const positions = Array.from({ length: n }, (_, i) => {
    const angle = n > 1 ? -totalAngle / 2 + (i * totalAngle) / (n - 1) : 0;
    const rad = angle * Math.PI / 180;
    return { angle, x: containerW / 2 - cw / 2 + fanRadius * Math.sin(rad), y: fanRadius * (1 - Math.cos(rad)) };
  });
  return { positions, containerW, containerH };
}

function assignCardIds(incoming: UnoCard[], prev: ClientCard[]): ClientCard[] {
  const used = new Set<string>();
  return incoming.map(card => {
    const match = prev.find(p => !used.has(p._id) && p.color === card.color && p.value === card.value);
    if (match) { used.add(match._id); return { ...card, _id: match._id }; }
    return { ...card, _id: Math.random().toString(36).slice(2) };
  });
}

export default function GamePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialState = location.state as GameState | null;
  const { isMobile, width: screenW, height: screenH } = useBreakpoint();

  // Responsive sizing
  const handCardSize = isMobile ? 'sm' : 'md';
  const centerCardSize = isMobile ? 'md' : 'lg';
  const cardW = DIMS[handCardSize].w;
  const cardH = DIMS[handCardSize].h;
  const centerCardW = DIMS[centerCardSize].w;
  const centerCardH = DIMS[centerCardSize].h;

  const [game, setGame] = useState<GameState | null>(initialState);
  const [hand, setHand] = useState<ClientCard[]>(() =>
    initialState?.hand?.map(c => ({ ...c, _id: Math.random().toString(36).slice(2) })) ?? []
  );
  const prevHandRef = useRef<ClientCard[]>(hand);
  const gameRef = useRef<GameState | null>(game);
  const handRef = useRef<ClientCard[]>(hand);
  gameRef.current = game;
  handRef.current = hand;

  // Animation state
  const [playFly, setPlayFly] = useState<{ card: UnoCard; x: number; y: number; toX: number; toY: number } | null>(null);
  const [oppPlayFly, setOppPlayFly] = useState<{ card: UnoCard; x: number; y: number; toX: number; toY: number } | null>(null);
  // Each draw fly has its own entry so multi-card draws animate in parallel with stagger
  const [drawFlies, setDrawFlies] = useState<{ id: string; x: number; y: number; toX: number; toY: number }[]>([]);
  // Cards hidden while their fly overlay is in-flight
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  // Cards that just arrived — rendered opacity:0 in the DOM so we can measure their position
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  // Signals which card _ids need a fly animation started (read in useLayoutEffect)
  const pendingToAnimateRef = useRef<string[]>([]);

  // UI state
  const [colorPickCard, setColorPickCard] = useState<UnoCard | null>(null);
  const [winner, setWinner] = useState<string | null>(null);
  const [lastEffect, setLastEffect] = useState<string | null>(null);
  const [rematchVotes, setRematchVotes] = useState<{ votes: number; total: number } | null>(null);
  const [hasVotedRematch, setHasVotedRematch] = useState(false);

  // Auto-draw timer — cancelled if the player acts manually first
  const autoDrawTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // DOM refs
  const discardRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<HTMLDivElement>(null);
  const handContainerRef = useRef<HTMLDivElement>(null);
  const cardEls = useRef<Map<string, HTMLElement>>(new Map());
  const oppPanelRefs = useRef<Map<string, HTMLElement>>(new Map());

  const isMyTurn = game ? game.currentTurn === game.myId : false;

  // After hand updates with new pending cards, measure their DOM positions and start fly animations.
  // useLayoutEffect fires after DOM mutations but before paint, so cardEls refs are already populated.
  useLayoutEffect(() => {
    const toAnimate = pendingToAnimateRef.current;
    if (toAnimate.length === 0) return;
    pendingToAnimateRef.current = [];

    const drawEl = drawRef.current;
    if (!drawEl) return;
    const dr = drawEl.getBoundingClientRect();
    const fromX = dr.left + dr.width / 2 - cardW / 2;
    const fromY = dr.top + dr.height / 2 - cardH / 2;

    toAnimate.forEach((id, i) => {
      const el = cardEls.current.get(id);
      if (!el) return;
      const rect = el.getBoundingClientRect();

      setTimeout(() => {
        setDrawFlies(prev => [...prev, { id, x: fromX, y: fromY, toX: rect.left, toY: rect.top }]);

        // After the fly lands, reveal the card and remove the overlay
        setTimeout(() => {
          setPendingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
          setDrawFlies(prev => prev.filter(f => f.id !== id));
        }, 400);
      }, i * 200);
    });
  }, [hand, cardW, cardH]);

  useEffect(() => {
    if (!initialState?.roomCode) { navigate('/'); return; }

    socket.on('gameStateUpdate', (state: Omit<GameState, 'roomCode' | 'playerName'> & { effect?: string }) => {
      if (state.effect) { setLastEffect(state.effect); setTimeout(() => setLastEffect(null), 2500); }

      // Opponent played a card: discardCount grew and it wasn't our turn
      const prevGame = gameRef.current;
      if (
        prevGame &&
        state.discardCount > (prevGame.discardCount ?? 0) &&
        prevGame.currentTurn !== prevGame.myId
      ) {
        const oppEl = oppPanelRefs.current.get(prevGame.currentTurn);
        const discardEl = discardRef.current;
        if (oppEl && discardEl) {
          const or = oppEl.getBoundingClientRect();
          const dr = discardEl.getBoundingClientRect();
          setOppPlayFly({
            card: state.topCard,
            x: or.left + or.width / 2 - centerCardW / 2,
            y: or.top + or.height / 2 - centerCardH / 2,
            toX: dr.left,
            toY: dr.top,
          });
        }
      }

      const newHand = assignCardIds(state.hand, prevHandRef.current);
      const added = newHand.filter(c => !prevHandRef.current.some(p => p._id === c._id));

      if (added.length > 0) {
        pendingToAnimateRef.current = added.map(c => c._id);
        setPendingIds(new Set(added.map(c => c._id)));
      }

      prevHandRef.current = newHand;
      setHand(newHand);
      setHiddenIds(new Set());
      setGame(prev => prev ? { ...state, roomCode: prev.roomCode, playerName: prev.playerName } : prev);

      // Auto-draw: schedule whenever it's my turn and I have no playable cards.
      // Done here (not in a useEffect) so it re-triggers even when currentTurn
      // doesn't change value (e.g. reverse/skip loops back to the same player).
      if (autoDrawTimerRef.current) clearTimeout(autoDrawTimerRef.current);
      if (state.currentTurn === state.myId) {
        const hasPlayable = state.hand.some(
          c => c.type === 'wild' || c.color === state.topCard?.color || c.value === state.topCard?.value
        );
        if (!hasPlayable) {
          autoDrawTimerRef.current = setTimeout(() => {
            const g = gameRef.current;
            if (g && g.currentTurn === g.myId) socket.emit('drawCard', { roomCode: g.roomCode });
          }, 1000);
        }
      }
    });

    socket.on('gameOver', ({ winnerName }: { winnerId: string; winnerName: string }) => setWinner(winnerName));

    socket.on('rematchStatus', ({ votes, total }: { votes: number; total: number }) => {
      setRematchVotes({ votes, total });
    });

    socket.on('rematchCancelled', () => navigate('/'));

    socket.on('rematchStarted', (newState: Omit<GameState, 'roomCode' | 'playerName'>) => {
      const newHand = newState.hand.map(c => ({ ...c, _id: Math.random().toString(36).slice(2) }));
      prevHandRef.current = newHand;
      setHand(newHand);
      setGame(prev => prev ? { ...newState, roomCode: prev.roomCode, playerName: prev.playerName } : prev);
      setWinner(null);
      setLastEffect(null);
      setRematchVotes(null);
      setHasVotedRematch(false);
      setPlayFly(null);
      setDrawFlies([]);
      setPendingIds(new Set());
      setHiddenIds(new Set());
    });

    return () => {
      socket.off('gameStateUpdate');
      socket.off('gameOver');
      socket.off('rematchStatus');
      socket.off('rematchCancelled');
      socket.off('rematchStarted');
    };
  }, [navigate, initialState?.roomCode]);

  if (!game) return null;

  const otherPlayers = game.players.filter(p => p.id !== game.myId);
  const maxMiniCards = isMobile ? 5 : 7;

  const handleCardClick = (card: ClientCard) => {
    if (!isMyTurn) return;
    if (autoDrawTimerRef.current) { clearTimeout(autoDrawTimerRef.current); autoDrawTimerRef.current = null; }
    const cardEl = cardEls.current.get(card._id);
    const discardEl = discardRef.current;
    if (cardEl && discardEl) {
      const cr = cardEl.getBoundingClientRect();
      const dr = discardEl.getBoundingClientRect();
      setHiddenIds(prev => new Set([...prev, card._id]));
      setPlayFly({
        card,
        x: cr.left, y: cr.top,
        toX: dr.left + dr.width / 2 - cardW / 2,
        toY: dr.top + dr.height / 2 - cardH / 2,
      });
    }
    if (card.type === 'wild') setColorPickCard(card);
    else socket.emit('playCard', { roomCode: game.roomCode, card });
  };

  const handleWildColor = (color: string) => {
    if (!colorPickCard) return;
    socket.emit('playCard', { roomCode: game.roomCode, card: colorPickCard, chosenColor: color });
    setColorPickCard(null);
  };

  const handleDrawCard = () => {
    if (!isMyTurn) return;
    if (autoDrawTimerRef.current) { clearTimeout(autoDrawTimerRef.current); autoDrawTimerRef.current = null; }
    socket.emit('drawCard', { roomCode: game.roomCode });
  };

  return (
    <MantineProvider>
      {/* Flying card overlays */}
      <AnimatePresence>
        {playFly && (
          <motion.div
            key='play-fly'
            style={{ position: 'fixed', left: 0, top: 0, zIndex: 1000, pointerEvents: 'none', width: cardW, height: cardH }}
            initial={{ x: playFly.x, y: playFly.y, rotate: 0, scale: 1 }}
            animate={{ x: playFly.toX, y: playFly.toY, rotate: [0, -8, 4, 0], scale: [1, 1.1, 1.05, 1] }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 220, damping: 22, duration: 0.4 }}
            onAnimationComplete={() => setPlayFly(null)}
          >
            <UnoCardFace card={playFly.card} size={handCardSize} />
          </motion.div>
        )}
        {oppPlayFly && (
          <motion.div
            key='opp-play-fly'
            style={{ position: 'fixed', left: 0, top: 0, zIndex: 1000, pointerEvents: 'none', width: centerCardW, height: centerCardH }}
            initial={{ x: oppPlayFly.x, y: oppPlayFly.y, rotate: 0, scale: 0.85 }}
            animate={{ x: oppPlayFly.toX, y: oppPlayFly.toY, rotate: [0, 12, -6, 0], scale: [0.85, 1.15, 1.05, 1] }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            onAnimationComplete={() => setOppPlayFly(null)}
          >
            <UnoCardFace card={oppPlayFly.card} size={centerCardSize} />
          </motion.div>
        )}
        {drawFlies.map(fly => (
          <motion.div
            key={`draw-fly-${fly.id}`}
            style={{ position: 'fixed', left: 0, top: 0, zIndex: 1000, pointerEvents: 'none', width: cardW, height: cardH }}
            initial={{ x: fly.x, y: fly.y, rotate: 0 }}
            animate={{ x: fly.toX, y: fly.toY, rotate: [0, 5, -3, 0] }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          >
            <CardBack size={handCardSize} />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Table layout */}
      {(() => {
        // Table geometry
        const handAreaH = isMobile ? 130 : 170;
        const availH = screenH - handAreaH;
        const cx = screenW / 2;
        // Large enough radii so even rotated fans clear the center table (~280×160px).
        const rx = Math.min(screenW * 0.46, 420);
        const ry = Math.min(availH * 0.38, 220);
        // cy: top opponent (at cy-ry) must clear screen top by ≥50px,
        // bottom opponents must clear hand area by ≥60px (cy+ry ≤ availH-60).
        const cy = Math.max(ry + 50, Math.min(availH - ry - 60, availH * 0.44));

        // Full-circle distribution: (n+1) seats spaced evenly around the clock.
        // The human's implicit seat is at 90° (bottom). Opponents fill the rest.
        const seatDeg = (i: number, n: number) => 90 + ((i + 1) * 360) / (n + 1);

        const handFan = computeFanLayout(hand.length, cardW, cardH, isMobile ? 260 : 340, Math.min(50, hand.length * 5), screenW - 24);

        return (
          <div style={{
            position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            background: '#07070f',
            backgroundImage: [
              'linear-gradient(rgba(0,229,255,0.04) 1px, transparent 1px)',
              'linear-gradient(90deg, rgba(0,229,255,0.04) 1px, transparent 1px)',
            ].join(', '),
            backgroundSize: '44px 44px',
          }}>

            {/* ── Opponents around the table ── */}
            {otherPlayers.map((p, oppIdx) => {
              const deg = seatDeg(oppIdx, otherPlayers.length);
              const rad = deg * Math.PI / 180;
              const oppX = cx + rx * Math.cos(rad);
              const oppY = cy + ry * Math.sin(rad);
              // Rotate the fan so its spine faces the table center (deg - 90)
              const fanRot = deg - 90;
              const active = game.currentTurn === p.id;
              const displayCount = Math.min(p.cardCount, maxMiniCards);
              const oppFan = computeFanLayout(displayCount, DIMS.sm.w, DIMS.sm.h, isMobile ? 110 : 140, Math.min(32, displayCount * 5), isMobile ? 110 : 140);
              // Place label outward (away from table) so it never overlaps the
              // center table. Then clamp to screen bounds so it never falls off edges.
              const fanHalfDiag = Math.ceil(Math.sqrt(oppFan.containerW ** 2 + oppFan.containerH ** 2) / 2);
              const labelDist = fanHalfDiag + 14;
              const rawLabelX = oppX + Math.cos(rad) * labelDist;
              const rawLabelY = oppY + Math.sin(rad) * labelDist;
              const labelX = Math.max(52, Math.min(screenW - 52, rawLabelX)) - oppX;
              const labelY = Math.max(16, Math.min(availH - 16, rawLabelY)) - oppY;
              return (
                // Anchor at (oppX, oppY) with zero layout size — children use absolute positioning
                <div key={p.id}
                  ref={(el: HTMLElement | null) => { if (el) oppPanelRefs.current.set(p.id, el); else oppPanelRefs.current.delete(p.id); }}
                  style={{
                    position: 'absolute', left: oppX, top: oppY,
                    width: 0, height: 0,
                    zIndex: 2 + Math.round((oppY / availH) * 10),
                  }}
                >
                  {/* Card fan centred at anchor, rotated so spine faces table */}
                  <motion.div
                    animate={{ filter: active ? 'drop-shadow(0 0 6px rgba(0,229,255,0.8))' : 'none' }}
                    transition={{ duration: 0.3 }}
                    style={{
                      position: 'absolute',
                      left: -oppFan.containerW / 2, top: -oppFan.containerH / 2,
                      transform: `rotate(${fanRot}deg)`,
                      transformOrigin: `${oppFan.containerW / 2}px ${oppFan.containerH / 2}px`,
                    }}
                  >
                    <div style={{ position: 'relative', width: oppFan.containerW, height: oppFan.containerH }}>
                      {oppFan.positions.map((pos, i) => (
                        <div key={i} style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${pos.x}px, ${pos.y}px) rotate(${pos.angle}deg)`, zIndex: i }}>
                          <CardBack size='sm' />
                        </div>
                      ))}
                    </div>
                  </motion.div>

                  {/* Label: inward of anchor by fanHalfDiag+buffer, dark pill so it
                      stays readable regardless of what's behind it */}
                  <div style={{
                    position: 'absolute',
                    left: labelX, top: labelY,
                    transform: 'translate(-50%, -50%)',
                    whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: 3,
                    background: 'rgba(7,7,15,0.75)',
                    borderRadius: 3,
                    padding: '2px 5px',
                  }}>
                    {active && (
                      <motion.span animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 0.8 }}
                        style={{ color: '#00e5ff', fontSize: 9, fontWeight: 900 }}>▶</motion.span>
                    )}
                    <Text fw={700} size='xs'
                      style={{ color: active ? '#00ddff' : 'rgba(255,255,255,0.75)', textShadow: active ? '0 0 8px rgba(0,229,255,0.7)' : 'none', fontSize: isMobile ? 10 : 11 }}
                    >{p.name}</Text>
                    <Text style={{ color: 'rgba(0,229,255,0.4)', fontSize: 9 }}>· {p.cardCount}</Text>
                  </div>
                </div>
              );
            })}

            {/* ── Center felt table ── */}
            <div style={{
              position: 'absolute', left: cx, top: cy,
              transform: 'translate(-50%, -50%)',
              zIndex: 15,
              borderRadius: 24,
              padding: isMobile ? '1rem 1.2rem' : '1.4rem 2.4rem',
              background: 'radial-gradient(ellipse at 50% 30%, #0c2218 0%, #061410 60%, #030d0a 100%)',
              border: '2px solid rgba(0,229,255,0.25)',
              boxShadow: '0 0 0 1px rgba(0,229,255,0.08), 0 0 40px rgba(0,229,255,0.1), 0 8px 32px rgba(0,0,0,0.7)',
            }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: 22, pointerEvents: 'none', opacity: 0.4, backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 6px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 6px)' }} />
              <div style={{ position: 'absolute', inset: 3, borderRadius: 20, pointerEvents: 'none', border: '1px solid rgba(255,255,255,0.03)' }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '1.2rem' : '2.5rem', position: 'relative' }}>
                {/* Discard */}
                <Stack align='center' gap={6}>
                  <Text size='xs' fw={700} style={{ color: 'rgba(255,100,200,0.7)', letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 10 }}>Discard</Text>
                  <div ref={discardRef} style={{ position: 'relative', width: centerCardW, height: centerCardH }}>
                    <AnimatePresence mode='wait'>
                      {game.topCard && (
                        <motion.div
                          key={`${game.topCard.color}-${game.topCard.value}-${game.discardCount}`}
                          style={{ position: 'absolute', top: 0, left: 0 }}
                          initial={{ scale: 0.6, rotate: -18, opacity: 0, y: -16 }}
                          animate={{ scale: 1, rotate: 0, opacity: 1, y: 0 }}
                          exit={{ scale: 0.7, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                        >
                          <UnoCardFace card={game.topCard} size={centerCardSize} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </Stack>

                <div style={{ width: 1, height: isMobile ? 60 : 90, background: 'linear-gradient(180deg, transparent, rgba(0,229,255,0.2), transparent)', flexShrink: 0 }} />

                {/* Draw */}
                <Stack align='center' gap={6}>
                  <Text size='xs' fw={700} style={{ color: 'rgba(0,200,220,0.7)', letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 10 }}>Draw</Text>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 5, left: 4, width: centerCardW, height: centerCardH, borderRadius: 10, background: 'rgba(0,8,16,0.9)' }} />
                    <div style={{ position: 'absolute', top: 2.5, left: 2, width: centerCardW, height: centerCardH, borderRadius: 10, background: 'rgba(0,8,16,0.95)' }} />
                    <motion.div
                      ref={drawRef}
                      onClick={handleDrawCard}
                      style={{ position: 'relative', cursor: isMyTurn ? 'pointer' : 'default' }}
                      animate={isMyTurn
                        ? { scale: [1, 1.06, 1], filter: ['brightness(1)', 'brightness(1.2)', 'brightness(1)'] }
                        : { scale: 1, filter: 'brightness(0.9)' }}
                      transition={isMyTurn ? { repeat: Infinity, duration: 1.6, ease: 'easeInOut' } : {}}
                      whileTap={isMyTurn ? { scale: 0.93 } : {}}
                    >
                      <CardBack size={centerCardSize} />
                    </motion.div>
                  </div>
                  <Text style={{ color: 'rgba(0,200,220,0.4)', fontSize: 10, letterSpacing: '0.08em' }}>{game.deckCount} left</Text>
                </Stack>
              </div>

              {/* Turn / effect indicator lives inside the table */}
              <div style={{ marginTop: '0.75rem', textAlign: 'center', minHeight: 28 }}>
                <AnimatePresence mode='wait'>
                  {lastEffect ? (
                    <motion.div key={lastEffect}
                      initial={{ y: -8, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 6, opacity: 0 }}
                      style={{ display: 'inline-block', background: 'rgba(255,0,212,0.1)', border: '1px solid rgba(255,0,212,0.5)', borderRadius: 2, padding: '4px 14px', boxShadow: '0 0 14px rgba(255,0,212,0.3)' }}
                    >
                      <Text fw={700} size='xs' style={{ color: '#ff88ee', letterSpacing: '0.04em' }}>{lastEffect}</Text>
                    </motion.div>
                  ) : (
                    <motion.div key={game.currentTurn}
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.2 }}
                      style={{ display: 'inline-block', background: isMyTurn ? 'rgba(0,229,255,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isMyTurn ? 'rgba(0,229,255,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 2, padding: '4px 14px', boxShadow: isMyTurn ? '0 0 12px rgba(0,229,255,0.2)' : 'none' }}
                    >
                      <Text fw={700} size='xs' style={{ color: isMyTurn ? '#00ddff' : 'rgba(255,255,255,0.5)', fontFamily: isMyTurn ? "'Courier New', monospace" : 'inherit', letterSpacing: '0.03em' }}>
                        {isMyTurn ? '> Your turn_' : `${game.players.find(p => p.id === game.currentTurn)?.name}'s turn`}
                      </Text>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* ── Player name badge above hand ── */}
            <div style={{ position: 'absolute', bottom: handAreaH + 4, left: '50%', transform: 'translateX(-50%)', zIndex: 20, textAlign: 'center', pointerEvents: 'none' }}>
              <Text fw={700} size='xs' style={{ color: isMyTurn ? '#00ddff' : 'rgba(255,255,255,0.45)', letterSpacing: '0.06em' }}>
                {game.playerName}
              </Text>
            </div>

            {/* ── Player hand ── */}
            <motion.div
              ref={handContainerRef}
              animate={isMyTurn
                ? { boxShadow: '0 -6px 40px rgba(0,229,255,0.2)', borderTopColor: 'rgba(0,229,255,0.4)' }
                : { boxShadow: '0 -2px 12px rgba(0,0,0,0.6)', borderTopColor: 'rgba(0,229,255,0.1)' }}
              transition={{ duration: 0.4 }}
              style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
                background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(7,7,15,0.95) 100%)',
                backdropFilter: 'blur(10px)',
                borderTop: '1px solid',
                padding: isMobile ? '0.8rem 0.5rem 1rem' : '1.2rem 1rem 1.5rem',
                display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
                minHeight: handFan.containerH + (isMobile ? 24 : 36),
              }}
            >
              <div style={{ position: 'relative', width: handFan.containerW, height: handFan.containerH }}>
                <AnimatePresence>
                  {hand.map((card, i) => {
                    const pos = handFan.positions[i];
                    const playable = isMyTurn && (card.type === 'wild' || card.color === game.topCard?.color || card.value === game.topCard?.value);
                    const isHidden = hiddenIds.has(card._id);
                    const isPending = pendingIds.has(card._id);
                    return (
                      <motion.div
                        key={card._id}
                        ref={el => { if (el) cardEls.current.set(card._id, el); else cardEls.current.delete(card._id); }}
                        style={{ position: 'absolute', left: 0, top: 0, zIndex: playable ? hand.length + i : i, cursor: playable ? 'pointer' : 'default' }}
                        initial={{ x: pos.x, y: pos.y + 60, rotate: pos.angle, opacity: 0, scale: 0.85 }}
                        animate={{
                          x: pos.x,
                          y: isHidden || isPending ? pos.y : playable ? pos.y - 20 : pos.y + 4,
                          rotate: pos.angle,
                          opacity: isHidden || isPending ? 0 : 1,
                          scale: 1,
                          filter: isHidden || isPending ? 'none' : playable ? 'brightness(1.05)' : 'brightness(0.38) saturate(0.25)',
                        }}
                        exit={{ y: pos.y - 100, scale: 1.15, opacity: 0, transition: { duration: 0.2 } }}
                        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                        whileHover={playable ? { y: pos.y - 44, scale: 1.12, zIndex: 200, filter: 'brightness(1.2) saturate(1.3)' } : {}}
                        whileTap={playable ? { scale: 0.95 } : {}}
                        onClick={playable ? () => handleCardClick(card) : undefined}
                      >
                        <UnoCardFace card={card} size={handCardSize} />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </motion.div>

          </div>
        );
      })()}

        {/* Wild picker */}
        <Modal opened={!!colorPickCard} onClose={() => setColorPickCard(null)} title='// CHOOSE COLOR' centered size='sm'
          styles={{ header: { background: '#0d0d1f', borderBottom: '1px solid rgba(0,229,255,0.2)' }, content: { background: '#0d0d1f', border: '1px solid rgba(0,229,255,0.3)', boxShadow: '0 0 40px rgba(0,229,255,0.15)' }, title: { color: '#00e5ff', fontFamily: 'monospace', letterSpacing: '0.1em' } }}
        >
          <Group justify='center' gap='md' p='md'>
            {WILD_COLORS.map(color => (
              <motion.div key={color} onClick={() => handleWildColor(color)}
                whileHover={{ scale: 1.15, boxShadow: `0 0 24px ${CARD_COLORS[color]}` }}
                whileTap={{ scale: 0.95 }}
                style={{ width: isMobile ? 52 : 64, height: isMobile ? 52 : 64, backgroundColor: CARD_COLORS[color], borderRadius: 4, cursor: 'pointer', border: '2px solid rgba(255,255,255,0.6)', boxShadow: `0 0 12px ${CARD_COLORS[color]}88`, clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}
              />
            ))}
          </Group>
        </Modal>

        {/* Game over */}
        <Modal opened={!!winner} onClose={() => {}} title='// GAME OVER' centered withCloseButton={false}
          styles={{ header: { background: '#0d0d1f', borderBottom: '1px solid rgba(255,0,212,0.3)' }, content: { background: '#0d0d1f', border: '1px solid rgba(255,0,212,0.4)', boxShadow: '0 0 60px rgba(255,0,212,0.2)' }, title: { color: '#ff00d4', fontFamily: 'monospace', letterSpacing: '0.1em' } }}
        >
          <Stack align='center' p='md' gap='md'>
            <Text fw={900} size='xl' style={{ color: '#00e5ff', letterSpacing: '0.1em', textShadow: '0 0 20px #00e5ff' }}>{winner?.toUpperCase()} WINS</Text>
            <Button
              onClick={() => {
                if (hasVotedRematch || !game) return;
                setHasVotedRematch(true);
                socket.emit('rematch', { roomCode: game.roomCode });
              }}
              disabled={hasVotedRematch}
              variant='outline'
              color='cyan'
              style={{ fontFamily: 'monospace', letterSpacing: '0.1em', minWidth: 180 }}
            >
              {hasVotedRematch
                ? rematchVotes ? `Ready — ${rematchVotes.votes}/${rematchVotes.total} want to play` : 'Ready…'
                : '[ PLAY AGAIN ]'}
            </Button>
            {!hasVotedRematch && rematchVotes && (
              <Text size='xs' style={{ color: 'rgba(0,229,255,0.5)', letterSpacing: '0.04em' }}>
                {rematchVotes.votes}/{rematchVotes.total} want to play again
              </Text>
            )}
            <Button
              onClick={() => {
                if (game) socket.emit('leaveRematch', { roomCode: game.roomCode });
                navigate('/');
              }}
              variant='subtle' color='gray' size='xs' style={{ letterSpacing: '0.05em' }}
            >
              Leave
            </Button>
          </Stack>
        </Modal>
    </MantineProvider>
  );
}
