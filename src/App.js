import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Card } from './components/Card';
const socket = io('http://localhost:5000');

function UnoGame() {
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

  console.log('Deck:', deck);

  return (
    <div>
      <h1>UNO Game</h1>
      {loading ? (
        <p>Loading deck...</p>
      ) : (
        <div>
          {(deck || []).map((card, index) => (
            <Card card={card} key={index} />
            // <li key={index}>
            //   {card.color} {card.value}
            // </li>
          ))}
        </div>
      )}
    </div>
  );
}

export default UnoGame;
