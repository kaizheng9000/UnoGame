import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import GameController from '../../../backend/controllers/gameController.js';
import { Scripts, Outlet, useLoaderData } from '@remix-run/react';

const socket = io('http://localhost:5000');

export async function loader() {
  const controller = new GameController();
  const deck = controller.getDeck();
  return deck;
}

function UnoGame() {
  const data = useLoaderData();
  const [deck, setDeck] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleDeckUpdate = shuffledDeck => {
      if (Array.isArray(shuffledDeck.cards)) {
        setDeck(shuffledDeck.cards);
        setLoading(false);
      } else {
        console.error('Received invalid deck:', shuffledDeck);
      }
    };

    socket.on('sendDeck', handleDeckUpdate);

    return () => {
      socket.off('sendDeck', handleDeckUpdate);
    };
  }, []);

  return (
    <html lang='en'>
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
      </head>
      <body>
        <MantineProvider>
          {/* <div>
        <h1>UNO Game</h1>
        <GameButton
          buttonName={'Host Game'}
          doOnClick={() => {
            {
              ('Hosting');
            }
          }}
        ></GameButton>
        {loading ? (
          <p>Loading deck...</p>
        ) : (
          <ul>
            {(deck || []).map((card, index) => (
              <li key={index}>
                {card.color} {card.value}
              </li>
            ))}
          </ul>
        )}
      </div> */}

          <Outlet />
          <Scripts />
        </MantineProvider>
      </body>
    </html>
  );
}

export default UnoGame;
