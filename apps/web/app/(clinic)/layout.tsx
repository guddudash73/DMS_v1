'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ClinicShell from '@/components/layout/ClinicShell';
import { useRequireAuth } from '@/src/hooks/useAuth';

export default function ClinicLayout({ children }: { children: React.ReactNode }) {
  const auth = useRequireAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status !== 'authenticated') return;

    if (auth.role === 'DOCTOR') router.replace('/doctor');
  }, [auth.status, auth.role, router]);

  if (
    auth.status === 'authenticated' &&
    auth.role &&
    auth.role !== 'RECEPTION' &&
    auth.role !== 'ADMIN'
  ) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-700">
        Redirecting…
      </div>
    );
  }

  return <ClinicShell>{children}</ClinicShell>;
}
