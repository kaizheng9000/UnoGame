// This needs to be the top-level wrapper for the app

import { MantineProvider } from '@mantine/core';
import { Scripts, Outlet } from '@remix-run/react';

function Layout() {
  return (
    <MantineProvider>
      <Outlet />
      <Scripts />
    </MantineProvider>
  );
}
