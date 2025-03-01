// This needs to be the home page

import { MantineProvider } from '@mantine/core';
import { HomePageButton } from '~/components/homePageButtons';

export default function HomePage() {
  return (
    <MantineProvider>
      <h1> Uno Games </h1>
      <div>
        <HomePageButton buttonName='Create Game'></HomePageButton>
        <HomePageButton buttonName='Host Game'></HomePageButton>
      </div>
    </MantineProvider>
  );
}
