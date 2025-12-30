// apps/web/components/layout/DoctorShell.tsx
'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  FileStack,
  Search,
  Calendar,
  Clock,
  Users,
  User,
  Layers,
  Pill, // ✅ NEW
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

import type { Patient } from '@dms/types';
import { useAuth } from '@/src/hooks/useAuth';
import {
  useGetPatientsQuery,
  useGetDoctorQueueQuery,
  useGetMeQuery,
  type ErrorResponse,
} from '@/src/store/api';
import LogoutButton from '@/components/auth/LogoutButton';

import { AppShellChrome, type PanelKey } from '@/components/layout/AppShell';
import { buildDateTimeLabels, deriveCurrentPanelFromPath } from '@/components/layout/shellUtils';
import { clinicDateISO } from '@/src/lib/clinicTime';

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  rightSlot?: React.ReactNode;
};

type ApiError = {
  status?: number;
  data?: unknown;
};

const doctorNav: NavItem[] = [
  { label: 'Dashboard', href: '/doctor', icon: LayoutDashboard },
  { label: 'Prescription', href: '/doctor/prescription', icon: FileText },
  { label: 'Documents', href: '/doctor/documents', icon: FileStack },

  // ✅ NEW: Medicines
  { label: 'Medicines', href: '/doctor/medicines', icon: Pill },

  // ✅ Rx Presets
  { label: 'Rx Presets', href: '/doctor/rx-presets', icon: Layers },
];

// ... unchanged below
const asErrorResponse = (data: unknown): ErrorResponse | null => {
  if (!data || typeof data !== 'object') return null;
  const maybe = data as Partial<ErrorResponse>;
  if (typeof maybe.error === 'string') {
    return {
      error: maybe.error,
      message: typeof maybe.message === 'string' ? maybe.message : undefined,
      fieldErrors:
        maybe.fieldErrors && typeof maybe.fieldErrors === 'object'
          ? (maybe.fieldErrors as Record<string, string[]>)
          : undefined,
      traceId: typeof maybe.traceId === 'string' ? maybe.traceId : undefined,
    };
  }
  return null;
};

function toDoctorFirstNameLabel(rawName: string | undefined | null): string {
  const name = (rawName ?? '').trim();
  if (!name) return 'Doctor';
  const first = name.split(/\s+/)[0];
  return first ? `Dr. ${first}` : 'Doctor';
}

function toAvatarFallback(rawName: string | undefined | null, fallback: string): string {
  const name = (rawName ?? '').trim();
  if (name) return name.slice(0, 1).toUpperCase();
  return fallback.slice(0, 1).toUpperCase();
}

export default function DoctorShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();

  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const { dateLabel, timeLabel } = buildDateTimeLabels(now);
  const todayIso = clinicDateISO(now);

  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;
  const doctorId = auth.userId ?? '';

  const { data: me } = useGetMeQuery(undefined, { skip: !canUseApi });

  const {
    data: doctorQueue,
    isLoading: doctorQueueLoading,
    isFetching: doctorQueueFetching,
  } = useGetDoctorQueueQuery({ doctorId, date: todayIso }, { skip: !canUseApi || !doctorId });

  const totalPatients = doctorQueue?.items?.length ?? 0;

  const [activeStatus, setActiveStatus] = useState(true);

  const doctorDisplay = useMemo(() => {
    const id = auth.userId ?? '';
    const short = id ? id.slice(0, 8) : 'Doctor';

    const fullName = me?.doctorProfile?.fullName;
    const displayName = me?.displayName;

    const labelName =
      auth.role === 'DOCTOR' ? toDoctorFirstNameLabel(fullName || displayName || short) : short;

    return {
      name: labelName,
      roleLabel: 'Doctor',
      avatarFallback: toAvatarFallback(fullName || displayName, short),
    };
  }, [auth.role, auth.userId, me?.doctorProfile?.fullName, me?.displayName]);

  // Search (unchanged)
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const resultsContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = searchTerm.trim();
      setDebouncedTerm(trimmed);
      setCursor(undefined);
      setPatients([]);
      setHasMore(false);
      setNextCursor(null);
      setDropdownOpen(Boolean(trimmed));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchTerm]);

  const {
    data: searchData,
    isLoading: searchLoading,
    isFetching: searchFetching,
    error: searchRawError,
  } = useGetPatientsQuery(
    { query: debouncedTerm || undefined, limit: 10, cursor },
    { skip: !debouncedTerm || auth.status === 'unauthenticated' },
  );

  useEffect(() => {
    if (!searchData) return;

    setPatients((prev) => {
      const byId = new Map<string, Patient>();
      for (const p of prev) byId.set(p.patientId, p);
      for (const p of searchData.items) byId.set(p.patientId, p);
      return Array.from(byId.values());
    });

    setHasMore(Boolean(searchData.nextCursor));
    setNextCursor(searchData.nextCursor ?? null);
  }, [searchData]);

  const searchErrorMessage = (() => {
    if (!searchRawError) return null;
    const e = searchRawError as ApiError;
    const maybe = asErrorResponse(e.data);
    return maybe?.message ?? 'Unable to search patients.';
  })();

  useEffect(() => {
    if (!resultsContainerRef.current || !sentinelRef.current) return;

    const root = resultsContainerRef.current;
    const sentinel = sentinelRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry.isIntersecting) return;
        if (!hasMore || !nextCursor) return;
        if (searchLoading || searchFetching) return;
        if (cursor === nextCursor) return;
        setCursor(nextCursor);
      },
      { root, rootMargin: '0px', threshold: 1.0 },
    );

    observer.observe(sentinel);
    return () => {
      observer.unobserve(sentinel);
      observer.disconnect();
    };
  }, [hasMore, nextCursor, searchLoading, searchFetching, cursor]);

  const resetSearch = () => {
    setDropdownOpen(false);
    setSearchTerm('');
    setDebouncedTerm('');
    setPatients([]);
    setCursor(undefined);
    setHasMore(false);
    setNextCursor(null);
  };

  const goToPatientProfile = (patientId: string) => {
    resetSearch();
    router.push(`/doctor/patients/${patientId}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (patients.length === 1) goToPatientProfile(patients[0].patientId);
  };

  const handleProfileClick = (e: MouseEvent<HTMLButtonElement>, patientId: string) => {
    e.stopPropagation();
    goToPatientProfile(patientId);
  };

  const showPanelSwitcher = auth.status === 'authenticated' && auth.role === 'ADMIN';
  const currentPanel = useMemo(() => deriveCurrentPanelFromPath(pathname), [pathname]);

  const handlePanelChange = (next: PanelKey) => {
    if (next === currentPanel) return;
    resetSearch();
    if (next === 'RECEPTION') router.replace('/');
    if (next === 'DOCTOR') router.replace('/doctor');
    if (next === 'ADMIN') router.replace('/admin');
  };

  return (
    <AppShellChrome
      variant="doctor"
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
        show: showPanelSwitcher,
        value: currentPanel,
        onChange: handlePanelChange,
        helperText: 'Switch between panels',
      }}
      nav={{ title: 'Manage', items: doctorNav }}
      header={{
        title: "Doctor's Panel",
        centerSlot: (
          <form
            className="relative flex w-full max-w-2xl items-center gap-2 rounded-full border bg-white py-1 pl-2 pr-1"
            onSubmit={handleSearchSubmit}
          >
            <Search className="text-gray-500" />
            <Input
              placeholder="Search with patient ID/Phone No. or Name..."
              className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => {
                if (debouncedTerm.trim().length > 0) setDropdownOpen(true);
              }}
            />
            <Button
              size="sm"
              type="submit"
              className="h-8 cursor-pointer rounded-full bg-gray-100 px-4 text-xs font-medium text-black hover:bg-black/90 hover:text-white"
            >
              Search
            </Button>

            {dropdownOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-2xl border bg-white shadow-lg">
                <div ref={resultsContainerRef} className="max-h-64 overflow-y-auto rounded-2xl">
                  {searchLoading && patients.length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
                  )}

                  {searchErrorMessage && !searchLoading && (
                    <div className="px-3 py-2 text-xs text-red-600">{searchErrorMessage}</div>
                  )}

                  {!searchLoading && !searchErrorMessage && patients.length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-500">
                      {!debouncedTerm
                        ? 'Type to search patients by phone or name.'
                        : auth.status === 'checking'
                          ? 'Checking session…'
                          : auth.status === 'unauthenticated'
                            ? 'Please log in to search patients.'
                            : 'No patients match your search.'}
                    </div>
                  )}

                  {patients.length > 0 && (
                    <ul className="divide-y">
                      {patients.map((p) => (
                        <li
                          key={p.patientId}
                          className="cursor-pointer px-3 py-2 text-xs hover:bg-gray-50"
                          onClick={() => goToPatientProfile(p.patientId)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex flex-col">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-gray-900">{p.name}</span>
                                <span className="text-[10px] text-gray-500">ID: {p.patientId}</span>
                              </div>
                              <div className="mt-0.5 text-[11px] text-gray-600">
                                {p.phone ?? 'No phone'} · {p.gender ?? 'Unknown'}
                              </div>
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 rounded-full hover:bg-gray-100"
                              onClick={(e) => handleProfileClick(e, p.patientId)}
                              aria-label="Open patient profile"
                            >
                              <User className="h-4 w-4 text-gray-600" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {searchFetching && patients.length > 0 && (
                    <div className="px-3 py-1 text-[10px] text-gray-500">Loading more…</div>
                  )}

                  <div ref={sentinelRef} className="h-2 w-full" />

                  {!hasMore && !searchFetching && patients.length > 0 && (
                    <div className="px-3 py-1 text-center text-[10px] text-gray-400">
                      No more results.
                    </div>
                  )}
                </div>
              </div>
            )}
          </form>
        ),
        rightSlot: (
          <>
            <div className="flex h-12 items-center justify-center gap-2 rounded-xl bg-gray-50 px-4 py-1">
              <Users className="h-5 w-5 text-gray-700" />
              <div className="text-[10px] font-semibold text-gray-500">
                <span className="block">Total</span>
                <span className="block">Patients:</span>
              </div>
              <div className="text-2xl font-semibold text-gray-900">
                {auth.status !== 'authenticated'
                  ? '—'
                  : (doctorQueueLoading || doctorQueueFetching) && !doctorQueue
                    ? '…'
                    : totalPatients}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="doctor-active-status" className="text-xs font-semibold text-gray-800">
                Active Status
              </Label>
              <Switch
                id="doctor-active-status"
                checked={activeStatus}
                onCheckedChange={setActiveStatus}
              />
            </div>
          </>
        ),
      }}
      footerUser={{
        user: {
          displayName: doctorDisplay.name,
          avatarFallback: doctorDisplay.avatarFallback,
          subLabel: <span>{doctorDisplay.roleLabel}</span>,
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
