export function Card({ card }) {
  //There are four types uno cards
  //Plain number
  //Draw
  //Effect cards - Skip - Reverse
  //Wild

  //Needs to check if its either 6 or 9 to include an underline

  //Need to update wild color - defaulting it gray
  if (card.value === 'wild') {
    card.color = '#808080';
  }
  return (
    <div className='card-container'>
      <div className='card-wrapper' style={{ background: card.color }}>
        <div className='card-header'>{card.value}</div>
        <div className='card-body' style={{ color: card.color }}>
          <div className='card-background'>
            <div className='card-value'>{card.value}</div>
          </div>
        </div>
        <div className='card-footer'>{card.value}</div>
      </div>
    </div>
  );
}
