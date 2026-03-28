import { useLocation, useNavigate } from '@remix-run/react';
import { useEffect, useState } from 'react';
import {
  MantineProvider,
  Text,
  Title,
  Button,
  Badge,
  Stack,
  Paper,
  Group,
  CopyButton,
  Tooltip,
  ActionIcon,
} from '@mantine/core';
import { Copy, Check, Crown } from 'lucide-react';
import socket from '../../backend/socket';

interface Player {
  id: string;
  name: string;
}

interface LocationState {
  roomCode: string;
  isHost: boolean;
  playerName: string;
  roomName: string;
  maxPlayers: number;
  players: Player[];
}

export default function WaitingRoom() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [players, setPlayers] = useState<Player[]>(state?.players ?? []);

  useEffect(() => {
    if (!state?.roomCode) {
      navigate('/');
      return;
    }

    socket.on('updatePlayers', (updatedPlayers: Player[]) => {
      setPlayers(updatedPlayers);
    });

    socket.on('gameStarted', (gameState: Record<string, unknown>) => {
      navigate('/game', { state: { ...gameState, roomCode: state.roomCode, playerName: state.playerName } });
    });

    return () => {
      socket.off('updatePlayers');
      socket.off('gameStarted');
    };
  }, [state, navigate]);

  if (!state?.roomCode) return null;

  const { roomCode, isHost, playerName, roomName, maxPlayers } = state;
  const canStart = players.length >= 2;

  const handleStartGame = () => {
    socket.emit('startGame', { roomCode });
  };

  return (
    <MantineProvider>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#252533',
          fontFamily: 'sans-serif',
          gap: '2rem',
        }}
      >
        <Title c='white' order={1}>
          {roomName}
        </Title>

        {/* Room Code */}
        <Paper
          p='md'
          radius='md'
          style={{ backgroundColor: '#1a1a2e', textAlign: 'center' }}
        >
          <Text size='sm' c='dimmed' mb={4}>
            Room Code
          </Text>
          <Group gap='xs' justify='center'>
            <Title order={2} c='white' style={{ letterSpacing: '0.2em' }}>
              {roomCode}
            </Title>
            <CopyButton value={roomCode} timeout={2000}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'Copied!' : 'Copy code'} withArrow>
                  <ActionIcon
                    color={copied ? 'teal' : 'gray'}
                    variant='subtle'
                    onClick={copy}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
          <Text size='xs' c='dimmed' mt={4}>
            Share this code with friends to join
          </Text>
        </Paper>

        {/* Player List */}
        <Paper
          p='lg'
          radius='md'
          style={{ backgroundColor: '#1a1a2e', minWidth: '320px' }}
        >
          <Text c='dimmed' size='sm' mb='md'>
            Players ({players.length} / {maxPlayers})
          </Text>
          <Stack gap='sm'>
            {players.length === 0 ? (
              <Text c='dimmed' size='sm' ta='center'>
                Waiting for players...
              </Text>
            ) : (
              players.map((player, index) => (
                <Group key={player.id} justify='space-between'>
                  <Group gap='xs'>
                    {index === 0 && (
                      <Crown size={16} color='gold' />
                    )}
                    <Text c='white'>
                      {player.name}
                      {player.name === playerName ? ' (you)' : ''}
                    </Text>
                  </Group>
                  {index === 0 && (
                    <Badge color='yellow' variant='light' size='sm'>
                      Host
                    </Badge>
                  )}
                </Group>
              ))
            )}
          </Stack>
        </Paper>

        {/* Start Game (host only) */}
        {isHost ? (
          <Stack align='center' gap='xs'>
            <Button
              size='lg'
              variant='gradient'
              gradient={{ from: 'blue', to: 'cyan', deg: 90 }}
              disabled={!canStart}
              onClick={handleStartGame}
            >
              Start Game
            </Button>
            {!canStart && (
              <Text size='xs' c='dimmed'>
                Need at least 2 players to start
              </Text>
            )}
          </Stack>
        ) : (
          <Text c='dimmed'>Waiting for the host to start the game...</Text>
        )}
      </div>
    </MantineProvider>
  );
}
