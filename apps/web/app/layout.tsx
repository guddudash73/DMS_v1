import '../styles/globals.css';
import type { Metadata } from 'next';
import AuthReadyGate from '@/components/AuthReadyGate';
import ClientRoot from '@/components/ClientRoot';
import { footlight } from '@/styles/fonts';

export const metadata: Metadata = {
  title: 'DCM - Dental Management System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`min-h-screen bg-background ${footlight.variable}`}>
        <ClientRoot>
          <AuthReadyGate>{children}</AuthReadyGate>
        </ClientRoot>
      </body>
    </html>
  );
}
