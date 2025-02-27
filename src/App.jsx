import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { GameButton } from './components/Buttons';

const socket = io('http://localhost:5000');
console.log('HELLO');

function UnoGame() {
  const [deck, setDeck] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    socket.on('connect', () => {
      console.log('CONNECTED TO SOCKET.IO');
    });

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

  console.log('Deck:', deck);

  return (
    <div>
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
    </div>
  );
}

export default UnoGame;
