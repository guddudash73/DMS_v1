'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DoctorShell from '@/components/layout/DoctorShell';
import { useRequireAuth } from '@/src/hooks/useAuth';

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const auth = useRequireAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status !== 'authenticated') return;

    if (auth.role === 'RECEPTION') router.replace('/');
    if (auth.role === 'ADMIN') router.replace('/admin');
  }, [auth.status, auth.role, router]);

  if (auth.status === 'authenticated' && auth.role && auth.role !== 'DOCTOR') {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-700">
        Redirecting…
      </div>
    );
  }

  return <DoctorShell>{children}</DoctorShell>;
}
