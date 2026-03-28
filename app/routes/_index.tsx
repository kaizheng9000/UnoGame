// This needs to be the home page

import { Users, UserPlus, Bot, HelpCircle, Settings } from 'lucide-react';
import { Button, MantineProvider, Text } from '@mantine/core';
import '../css/index.css';
import { BaseModal } from '~/components/ui/BaseModal';
import { BaseForm } from '~/components/ui/BaseForm';
import { useNavigate } from '@remix-run/react';
import socket from '../../backend/socket';
import { useEffect, useRef, useState } from 'react';

export default function HomePage() {
  const navigate = useNavigate();
  const pendingValues = useRef<Record<string, string> | null>(null);
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on(
      'joinedRoom',
      ({
        roomCode,
        isHost,
        maxPlayers,
        players,
      }: {
        roomCode: string;
        isHost: boolean;
        maxPlayers: number;
        players: { id: string; name: string }[];
      }) => {
        navigate('/waitingRoom', {
          state: {
            roomCode,
            isHost,
            playerName: pendingValues.current?.playerName,
            maxPlayers,
            players,
          },
        });
      },
    );

    socket.on('gameStarted', (state: Record<string, unknown>) => {
      navigate('/game', {
        state: { ...state, playerName: pendingValues.current?.playerName },
      });
    });

    socket.on('roomError', (message: string) => {
      alert(message);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('joinedRoom');
      socket.off('gameStarted');
      socket.off('roomError');
    };
  }, [navigate]);

  const handleCreateRoom = (values: Record<string, string>) => {
    pendingValues.current = values;
    socket.emit('createRoom', {
      playerName: values.playerName,
      maxPlayers: values.maxPlayers,
    });
  };

  const handleSinglePlayer = (values: Record<string, string>) => {
    pendingValues.current = values;
    socket.emit('createSinglePlayerRoom', {
      playerName: values.playerName,
      botCount: parseInt(values.botCount),
    });
  };

  const handleJoinRoom = (values: Record<string, string>) => {
    pendingValues.current = values;
    socket.emit('joinRoom', {
      roomCode: values.roomCode,
      playerName: values.playerName,
    });
  };

  return (
    <MantineProvider>
      <div className='homePage'>
        {/* Header for settings and help */}
        <div className='headerButtons'>
          <Text size='xs' c={connected ? 'teal' : 'red'}>
            {connected ? '● Connected' : '● Disconnected'}
          </Text>
          <Button variant='subtle' color='gray' radius='xl' p={8}>
            <HelpCircle size={24} />
          </Button>
          <Button variant='subtle' color='gray' radius='xl' p={8}>
            <Settings size={24} />
          </Button>
        </div>

        {/* Custom Logo */}
        <div className='frontPageLogo'>
          <div className='frontPageLogoWrapper'>
            <div className='frontPageLogoGlow'></div>
            <img
              src={'/images/uno.webp'}
              alt='UNO Game Logo'
              className='logoContainer'
            />
          </div>
          <Text size='xl' fw={500} c='dimmed'>
            Good Game, Bad Dev
          </Text>
        </div>

        {/* Join and Create room buttons */}
        <div className='homePageButtons'>
          <BaseModal
            title='Single Player'
            buttonName='Single Player'
            icon={<Bot size={28} />}
          >
            <BaseForm
              onSubmit={handleSinglePlayer}
              submitLabel='Play'
              fields={[
                {
                  name: 'playerName',
                  label: 'Your Name',
                  placeholder: 'Enter the name you want displayed',
                  required: true,
                },
                {
                  name: 'botCount',
                  label: 'Number of Bots',
                  type: 'select',
                  data: ['1', '2', '3', '4', '5', '6', '7'],
                  required: true,
                  defaultValue: '1',
                },
              ]}
            />
          </BaseModal>

          <BaseModal
            title='Join Information'
            buttonName='Join Room'
            icon={<Users size={28} />}
          >
            <BaseForm
              onSubmit={handleJoinRoom}
              submitLabel='Join'
              fields={[
                {
                  name: 'playerName',
                  label: 'Player Name',
                  placeholder: 'Enter the name you want displayed',
                  required: true,
                },
                {
                  name: 'roomCode',
                  label: 'Room Code',
                  placeholder: 'Enter Room Code Here',
                  required: true,
                },
              ]}
            ></BaseForm>
          </BaseModal>

          <BaseModal
            title='Room Information'
            buttonName='Create Room'
            icon={<UserPlus size={28} />}
          >
            <BaseForm
              onSubmit={handleCreateRoom}
              submitLabel='Create'
              fields={[
                {
                  name: 'playerName',
                  label: 'Player Name',
                  placeholder: 'Enter the name you want displayed',
                  required: true,
                },
                {
                  name: 'maxPlayers',
                  label: 'Maximum Number of Players',
                  type: 'select',
                  data: ['2', '3', '4', '5', '6', '7', '8'],
                  required: true,
                  defaultValue: '2',
                },
              ]}
            ></BaseForm>
          </BaseModal>
        </div>
      </div>
    </MantineProvider>
  );
}
