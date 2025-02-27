import { Button } from '@mantine/core';

export function GameButton({ buttonName, doOnClick }) {
  return (
    <div className='flex flex-col items-center gap-4 p-4'>
      <Button
        className='w-40 bg-blue-500 text-white hover:bg-blue-700 p-2 rounded-lg'
        onClick={doOnClick}
      >
        {buttonName}
      </Button>
    </div>
  );
}
