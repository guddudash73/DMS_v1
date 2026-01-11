// apps/web/app/(admin)/admin/layout.tsx
'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/layout/AdminShell';
import { useAuth } from '@/src/hooks/useAuth';

type Role = 'RECEPTION' | 'DOCTOR' | 'ADMIN';
type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getStatus(auth: unknown): AuthStatus | undefined {
  if (!isRecord(auth)) return undefined;
  const s = auth.status;
  return s === 'checking' || s === 'authenticated' || s === 'unauthenticated' ? s : undefined;
}

function extractRole(auth: unknown): Role | undefined {
  if (!isRecord(auth)) return undefined;

  // single role: auth.user.role OR auth.role
  const user = isRecord(auth.user) ? auth.user : undefined;

  const single = (user?.role ?? auth.role) as unknown;
  if (single === 'RECEPTION' || single === 'DOCTOR' || single === 'ADMIN') return single;

  // roles array: auth.user.roles OR auth.roles
  const roles = (user?.roles ?? auth.roles) as unknown;
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

  const status = getStatus(auth);
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
