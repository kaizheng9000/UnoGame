import { useLocation, useNavigate } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { MantineProvider, Text, Button, Group, Modal, Stack, Title } from '@mantine/core';
import socket from '../../backend/socket';
import type { UnoCard } from '../../backend/models/unoDeck';

interface PlayerInfo {
  id: string;
  name: string;
  cardCount: number;
}

interface GameState {
  hand: UnoCard[];
  topCard: UnoCard;
  currentTurn: string;
  deckCount: number;
  players: PlayerInfo[];
  myId: string;
  roomCode: string;
  playerName: string;
}

const CARD_COLORS: Record<string, string> = {
  red: '#dc2626',
  blue: '#2563eb',
  green: '#16a34a',
  yellow: '#ca8a04',
  wild: '#312e81',
};

const WILD_COLORS = ['red', 'blue', 'green', 'yellow'] as const;

function cardLabel(card: UnoCard): string {
  if (typeof card.value === 'number') return String(card.value);
  switch (card.value) {
    case 'skip': return 'SKIP';
    case 'reverse': return 'REV';
    case 'draw two': return '+2';
    case 'wild': return 'WILD';
    case 'wild draw four': return 'W+4';
    default: return String(card.value);
  }
}

function UnoCardView({
  card,
  onClick,
  disabled,
  size = 'md',
}: {
  card: UnoCard;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const bg = CARD_COLORS[card.color] ?? '#312e81';
  const dims = size === 'lg' ? { w: 90, h: 130, fs: 18 }
    : size === 'sm' ? { w: 44, h: 64, fs: 11 }
    : { w: 70, h: 100, fs: 15 };
  const clickable = !!onClick && !disabled;

  return (
    <div
      onClick={clickable ? onClick : undefined}
      style={{
        width: dims.w,
        height: dims.h,
        backgroundColor: bg,
        borderRadius: 8,
        border: '3px solid white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: clickable ? 'pointer' : 'default',
        opacity: disabled ? 0.45 : 1,
        flexShrink: 0,
        userSelect: 'none',
        transition: 'transform 0.15s',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      }}
      onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLElement).style.transform = 'translateY(-10px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
    >
      <span style={{ color: 'white', fontWeight: 900, fontSize: dims.fs, textShadow: '0 1px 4px rgba(0,0,0,0.6)', textAlign: 'center' }}>
        {cardLabel(card)}
      </span>
    </div>
  );
}

function CardBack({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? { w: 90, h: 130 } : size === 'sm' ? { w: 44, h: 64 } : { w: 70, h: 100 };
  return (
    <div style={{
      width: dims.w, height: dims.h,
      backgroundColor: '#1e1b4b',
      borderRadius: 8,
      border: '3px solid white',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    }}>
      <span style={{ color: 'white', fontWeight: 900, fontSize: 20 }}>UNO</span>
    </div>
  );
}

export default function GamePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialState = location.state as GameState | null;

  const [game, setGame] = useState<GameState | null>(initialState);
  const [colorPickCard, setColorPickCard] = useState<UnoCard | null>(null);
  const [winner, setWinner] = useState<string | null>(null);

  useEffect(() => {
    if (!initialState?.roomCode) { navigate('/'); return; }

    socket.on('gameStateUpdate', (state: Omit<GameState, 'roomCode' | 'playerName'>) => {
      setGame(prev => prev ? { ...state, roomCode: prev.roomCode, playerName: prev.playerName } : prev);
    });

    socket.on('gameOver', ({ winnerName }: { winnerId: string; winnerName: string }) => {
      setWinner(winnerName);
    });

    return () => {
      socket.off('gameStateUpdate');
      socket.off('gameOver');
    };
  }, [navigate, initialState?.roomCode]);

  if (!game) return null;

  const isMyTurn = game.currentTurn === game.myId;
  const otherPlayers = game.players.filter(p => p.id !== game.myId);

  const handleCardClick = (card: UnoCard) => {
    if (!isMyTurn) return;
    if (card.type === 'wild') {
      setColorPickCard(card);
    } else {
      socket.emit('playCard', { roomCode: game.roomCode, card });
    }
  };

  const handleColorPick = (color: string) => {
    if (!colorPickCard) return;
    socket.emit('playCard', { roomCode: game.roomCode, card: colorPickCard, chosenColor: color });
    setColorPickCard(null);
  };

  const handleDrawCard = () => {
    if (!isMyTurn) return;
    socket.emit('drawCard', { roomCode: game.roomCode });
  };

  return (
    <MantineProvider>
      <div style={{
        display: 'flex', flexDirection: 'column',
        height: '100vh', backgroundColor: '#166534',
        fontFamily: 'sans-serif', overflow: 'hidden',
      }}>

        {/* Other players */}
        <div style={{ padding: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {otherPlayers.map(p => {
            const isTheirTurn = game.currentTurn === p.id;
            return (
              <div key={p.id} style={{
                backgroundColor: isTheirTurn ? 'rgba(250,204,21,0.25)' : 'rgba(0,0,0,0.3)',
                border: isTheirTurn ? '2px solid #fbbf24' : '2px solid transparent',
                borderRadius: 12, padding: '0.5rem 1rem', textAlign: 'center', minWidth: 100,
              }}>
                <Text c='white' fw={700} size='sm'>{p.name}</Text>
                <Group gap={4} justify='center' mt={4}>
                  {Array.from({ length: Math.min(p.cardCount, 7) }).map((_, i) => (
                    <CardBack key={i} size='sm' />
                  ))}
                  {p.cardCount > 7 && <Text c='white' size='xs'>+{p.cardCount - 7}</Text>}
                </Group>
                <Text c='dimmed' size='xs' mt={4}>{p.cardCount} cards</Text>
              </div>
            );
          })}
        </div>

        {/* Center: discard + draw pile */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3rem' }}>
          <Stack align='center' gap='xs'>
            <Text c='white' size='xs'>DISCARD</Text>
            {game.topCard && <UnoCardView card={game.topCard} size='lg' />}
          </Stack>

          <Stack align='center' gap='xs'>
            <Text c='white' size='xs'>DRAW ({game.deckCount})</Text>
            <div onClick={isMyTurn ? handleDrawCard : undefined} style={{ cursor: isMyTurn ? 'pointer' : 'default' }}>
              <CardBack size='lg' />
            </div>
          </Stack>
        </div>

        {/* Turn indicator */}
        <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          <Text c={isMyTurn ? '#fbbf24' : 'rgba(255,255,255,0.6)'} fw={700} size='sm'>
            {isMyTurn ? "Your turn — play a card or draw" : `${game.players.find(p => p.id === game.currentTurn)?.name}'s turn`}
          </Text>
        </div>

        {/* Your hand */}
        <div style={{
          backgroundColor: 'rgba(0,0,0,0.35)',
          padding: '1rem',
          display: 'flex', gap: '0.5rem',
          overflowX: 'auto', justifyContent: 'center',
        }}>
          {game.hand.map((card, i) => {
            const topCard = game.topCard;
            const playable = isMyTurn && (
              card.type === 'wild' ||
              card.color === topCard?.color ||
              card.value === topCard?.value
            );
            return (
              <UnoCardView
                key={i}
                card={card}
                onClick={playable ? () => handleCardClick(card) : undefined}
                disabled={!playable}
              />
            );
          })}
        </div>

        {/* Wild color picker */}
        <Modal
          opened={!!colorPickCard}
          onClose={() => setColorPickCard(null)}
          title='Choose a color'
          centered
          size='sm'
        >
          <Group justify='center' gap='md' p='md'>
            {WILD_COLORS.map(color => (
              <div
                key={color}
                onClick={() => handleColorPick(color)}
                style={{
                  width: 64, height: 64,
                  backgroundColor: CARD_COLORS[color],
                  borderRadius: 12, cursor: 'pointer',
                  border: '3px solid white',
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
              />
            ))}
          </Group>
        </Modal>

        {/* Game over modal */}
        <Modal opened={!!winner} onClose={() => {}} title='Game Over' centered withCloseButton={false}>
          <Stack align='center' p='md' gap='md'>
            <Title order={2}>🎉 {winner} wins!</Title>
            <Button onClick={() => navigate('/')} variant='gradient' gradient={{ from: 'blue', to: 'cyan' }}>
              Back to Home
            </Button>
          </Stack>
        </Modal>
      </div>
    </MantineProvider>
  );
}
