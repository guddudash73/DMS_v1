'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DoctorShell from '@/components/layout/DoctorShell';
import { useRequireAuth } from '@/src/hooks/useAuth';

export default function DoctorLayoutClient({ children }: { children: React.ReactNode }) {
  const auth = useRequireAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status !== 'authenticated') return;

    if (auth.role === 'RECEPTION') router.replace('/');
  }, [auth.status, auth.role, router]);

  if (
    auth.status === 'authenticated' &&
    auth.role &&
    auth.role !== 'DOCTOR' &&
    auth.role !== 'ADMIN'
  ) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-700">
        Redirecting…
      </div>
    );
  }

  return <DoctorShell>{children}</DoctorShell>;
}
