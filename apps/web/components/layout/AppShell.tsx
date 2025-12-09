'use client';

import type React from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const AUTH_PAGES = ['/', '/login'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isAuthPage = AUTH_PAGES.includes(pathname);

  // For auth pages (login, root) we render children WITHOUT sidebar/topbar
  if (isAuthPage) {
    return <>{children}</>;
  }

  // For all other routes we keep the existing app shell
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[260px_1fr]">
      <aside className="border-r bg-white">
        <Sidebar />
      </aside>
      <div className="flex min-h-screen flex-col">
        <Topbar />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
