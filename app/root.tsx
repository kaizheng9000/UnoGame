// This needs to be the top-level wrapper for the app

import { MantineProvider } from '@mantine/core';
import { Scripts, Outlet } from '@remix-run/react';

export default function Layout() {
  return (
    <html>
      <head></head>
      <body>
        <MantineProvider>
          <Outlet />
          <Scripts />
        </MantineProvider>
      </body>
    </html>
  );
}
