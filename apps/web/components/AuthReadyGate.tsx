'use client';

import { useAuth } from '@/src/hooks/useAuth';

export default function AuthReadyGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();

  // BLOCK ALL RENDERS UNTIL HYDRATION FINISHES
  // this eliminates initial 401s across the app
  if (auth.status === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center text-gray-700 text-sm">
        Loading session…
      </div>
    );
  }

  return <>{children}</>;
}
