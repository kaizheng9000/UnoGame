// This needs to be the top-level wrapper for the app

import { MantineProvider } from '@mantine/core';
import { Scripts, Outlet, Links } from '@remix-run/react';
import type { LinksFunction } from '@remix-run/node';
import stylesheet from '~/tailwind.css?url';
import '@mantine/core/styles.css';

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: stylesheet },
];

export default function Layout() {
  return (
    <html lang='en'>
      <head>
        <Links />
      </head>
      <body>
        <MantineProvider>
          <Outlet />
          <Scripts />
        </MantineProvider>
      </body>
    </html>
  );
}
