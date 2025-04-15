import { useDisclosure } from '@mantine/hooks';
import { Modal, Button } from '@mantine/core';

interface Props {
  title: string;
  buttonName?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function BaseModal({ title, buttonName, icon, children }: Props) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Modal opened={opened} onClose={close} title={title} size='auto' centered>
        {children}
      </Modal>

      <Button
        className='button'
        variant='gradient'
        gradient={{ from: 'blue', to: 'cyan', deg: 90 }}
        size='xl'
        radius='md'
        color='black'
        leftSection={icon}
        justify='start'
        onClick={open}
      >
        {buttonName}
      </Button>
    </>
  );
}
