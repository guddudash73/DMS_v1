// apps/web/components/layout/AdminShell.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  UserCog,
  Pill,
  FileText,
  Settings,
  Calendar,
  Clock,
  ShieldCheck,
} from 'lucide-react';

import LogoutButton from '@/components/auth/LogoutButton';
import { useAuth } from '@/src/hooks/useAuth';

import { AppShellChrome, type PanelKey } from '@/components/layout/AppShell';
import { buildDateTimeLabels, deriveCurrentPanelFromPath } from '@/components/layout/shellUtils';

type AdminShellProps = {
  children: React.ReactNode;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const adminNav: NavItem[] = [
  { label: 'Admin Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Users & Roles', href: '/admin/users', icon: Users },
  { label: 'Doctors', href: '/admin/doctors', icon: UserCog },
  { label: 'Medicines', href: '/admin/medicines', icon: Pill },
  { label: 'Rx Presets', href: '/admin/rx-presets', icon: FileText },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];

const deriveTitleFromPath = (pathname: string): string => {
  if (pathname === '/admin') return 'Admin Dashboard';
  if (pathname.startsWith('/admin/users')) return 'Users & Roles';
  if (pathname.startsWith('/admin/doctors')) return 'Doctors';
  if (pathname.startsWith('/admin/medicines')) return 'Medicines';
  if (pathname.startsWith('/admin/rx-presets')) return 'Rx Presets';
  if (pathname.startsWith('/admin/settings')) return 'Settings';
  return 'Admin';
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getAuthDisplayName(auth: unknown): string {
  if (!isRecord(auth)) return 'Admin';
  const user = auth['user'];
  if (!isRecord(user)) return 'Admin';

  const fullName = user['fullName'];
  if (typeof fullName === 'string' && fullName.trim()) return fullName;

  const name = user['name'];
  if (typeof name === 'string' && name.trim()) return name;

  return 'Admin';
}

export default function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();

  const pageTitle = deriveTitleFromPath(pathname);

  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { dateLabel, timeLabel } = buildDateTimeLabels(now);

  const currentPanel = useMemo(() => deriveCurrentPanelFromPath(pathname), [pathname]);

  const handlePanelChange = (next: PanelKey) => {
    if (next === 'RECEPTION') router.replace('/');
    if (next === 'DOCTOR') router.replace('/doctor');
    if (next === 'ADMIN') router.replace('/admin');
  };

  const displayName = getAuthDisplayName(auth);
  const avatarFallback = String(displayName).slice(0, 1).toUpperCase();

  return (
    <AppShellChrome
      variant="admin"
      brand={{ logoSrc: '/dashboard-logo.png', logoAlt: 'Sarangi Dentistry' }}
      dateTimeSlot={
        <>
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span>{dateLabel}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>{timeLabel}</span>
          </div>
        </>
      }
      panelSwitcher={{
        show: true,
        value: currentPanel,
        onChange: handlePanelChange,
        helperText: 'Switch between panels',
      }}
      nav={{ title: 'Admin', items: adminNav }}
      header={{
        title: pageTitle,
        subtitleRight: 'Admin configuration',
      }}
      footerUser={{
        user: {
          displayName,
          avatarFallback,
          subLabel: (
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Admin</span>
            </span>
          ),
        },
        rightSlot: (
          <LogoutButton
            className="h-7 w-7 rounded-full text-gray-500 hover:bg-gray-100 cursor-pointer"
            variant="ghost"
            size="icon"
            iconOnly
          />
        ),
      }}
    >
      {children}
    </AppShellChrome>
  );
}
