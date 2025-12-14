// apps/web/app/(clinic)/layout.tsx
'use client';

import ClientRoot from '@/components/ClientRoot';
import ClinicShell from '@/components/layout/ClinicShell';
import { useRequireAuth } from '@/src/hooks/useAuth';

export default function ClinicLayout({ children }: { children: React.ReactNode }) {
  useRequireAuth();

  return <ClinicShell>{children}</ClinicShell>;
}
