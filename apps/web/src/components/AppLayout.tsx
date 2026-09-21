import type { ReactElement } from 'react';
import { Outlet } from 'react-router';

import { AppHeader } from './AppHeader';

/** What every signed-in screen sits in: the shared header above the screen itself. */
export function AppLayout(): ReactElement {
  return (
    <div className="ui-page">
      <AppHeader />
      <Outlet />
    </div>
  );
}
