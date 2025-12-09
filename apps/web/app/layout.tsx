import '../styles/globals.css';
import type { Metadata } from 'next';
import AuthReadyGate from '@/components/AuthReadyGate';
import ClientRoot from '@/components/ClientRoot';

export const metadata: Metadata = {
  title: 'DMS - Dental Management System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientRoot>
          <AuthReadyGate>{children}</AuthReadyGate>
        </ClientRoot>
      </body>
    </html>
  );
}
