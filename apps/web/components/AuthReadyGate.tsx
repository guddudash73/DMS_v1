'use client';

import { useAuth } from '@/src/hooks/useAuth';

export default function AuthReadyGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();

  if (auth.status === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center text-gray-700 text-sm">
        Loading session…
      </div>
    );
  }

  return <>{children}</>;
}
