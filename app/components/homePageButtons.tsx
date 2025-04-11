import { Button } from '@mantine/core';

export function HomePageButton({
  buttonName,
  icon,
  onClick = () => {},
}: Props) {
  return (
    <Button
      className='button'
      variant='gradient'
      gradient={{ from: 'blue', to: 'cyan', deg: 90 }}
      size='xl'
      radius='md'
      color='black'
      leftSection={icon}
      justify='start'
      onClick={onClick}
    >
      {buttonName}
    </Button>
  );
}

interface Props {
  buttonName: string;
  onClick?: () => void;
  icon?: React.ReactNode;
}
