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

    // ✅ Keep existing behavior: doctors do NOT belong in clinic routes
    if (auth.role === 'DOCTOR') router.replace('/doctor');

    // ✅ IMPORTANT CHANGE: Admin is allowed to be here (no redirect)
    // if (auth.role === 'ADMIN') router.replace('/admin');
  }, [auth.status, auth.role, router]);

  // ✅ Allow RECEPTION and ADMIN to render clinic shell
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
