// This needs to be the home page

import { Users, UserPlus, HelpCircle, Settings } from 'lucide-react';
import { Button, MantineProvider, Text } from '@mantine/core';
import { HomePageButton } from '~/components/homePageButtons';
import '../css/index.css';

export default function HomePage() {
  return (
    <MantineProvider>
      <div className='homePage'>
        {/* Header for settings and help */}
        <div className='headerButtons'>
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
          <HomePageButton
            buttonName='Join Room'
            icon={<Users size={28} />}
            onClick={() => console.log('Join button clicked')}
          ></HomePageButton>

          <HomePageButton
            buttonName='Create Room'
            icon={<UserPlus size={28} />}
            onClick={() => console.log('Create button clicked')}
          ></HomePageButton>
        </div>
      </div>
    </MantineProvider>
  );
}
