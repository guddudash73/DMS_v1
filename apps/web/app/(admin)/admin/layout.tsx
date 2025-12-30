'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/layout/AdminShell';
import { useAuth } from '@/src/hooks/useAuth';

type Role = 'RECEPTION' | 'DOCTOR' | 'ADMIN';

function extractRole(auth: unknown): Role | undefined {
  const a = auth as any;
  const single = a?.user?.role ?? a?.role;
  if (single === 'RECEPTION' || single === 'DOCTOR' || single === 'ADMIN') return single;

  const roles = a?.user?.roles ?? a?.roles;
  if (Array.isArray(roles)) {
    if (roles.includes('ADMIN')) return 'ADMIN';
    if (roles.includes('DOCTOR')) return 'DOCTOR';
    if (roles.includes('RECEPTION')) return 'RECEPTION';
  }

  return undefined;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();

  const status = (auth as any)?.status as 'checking' | 'authenticated' | 'unauthenticated';
  const role = useMemo(() => extractRole(auth), [auth]);

  const isChecking = status === 'checking';
  const isAuthed = status === 'authenticated';
  const isAdmin = isAuthed && role === 'ADMIN';

  useEffect(() => {
    if (isChecking) return;

    if (status === 'unauthenticated') {
      router.replace('/login?from=/admin');
      return;
    }

    if (isAuthed && role && role !== 'ADMIN') {
      router.replace('/');
    }
  }, [isChecking, status, isAuthed, role, router]);

  if (isChecking || (isAuthed && !role)) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="rounded-2xl border bg-white px-6 py-4 text-sm text-gray-600 shadow-sm">
          Checking admin access…
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="rounded-2xl border bg-white px-6 py-4 text-sm text-gray-600 shadow-sm">
          Redirecting…
        </div>
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
