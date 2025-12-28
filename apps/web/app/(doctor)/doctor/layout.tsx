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

    // ✅ Keep existing behavior: reception does NOT belong in doctor routes
    if (auth.role === 'RECEPTION') router.replace('/');

    // ✅ IMPORTANT CHANGE: Admin is allowed to be here (no redirect)
    // if (auth.role === 'ADMIN') router.replace('/admin');
  }, [auth.status, auth.role, router]);

  // ✅ Allow DOCTOR and ADMIN to render doctor shell
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
