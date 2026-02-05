'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  UserPlus,
  User,
  FileText,
  Headphones,
  Users,
  Search,
  Calendar,
  Clock,
  Settings,
  Printer,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { Patient } from '@dcm/types';
import {
  useGetPatientsQuery,
  type ErrorResponse,
  useGetDailyPatientSummaryQuery,
  useClinicRealtimeQuery,
  useGetMeQuery,
} from '@/src/store/api';
import { useAuth } from '@/src/hooks/useAuth';
import NewPatientModal from '@/components/patients/NewPatientModal';
import RegisterVisitModal from '@/components/visits/RegisterVisitModal';
import LogoutButton from '@/components/auth/LogoutButton';

import { toast } from 'react-toastify';
import { loadPrintSettings, savePrintSettings } from '@/src/lib/printing/settings';
import { listPrinters, pickPreferredPrinter } from '@/src/lib/printing/qz';

import { AppShellChrome, type PanelKey } from '@/components/layout/AppShell';
import { buildDateTimeLabels, deriveCurrentPanelFromPath } from '@/components/layout/shellUtils';
import { clinicDateISO } from '@/src/lib/clinicTime';

type ClinicShellProps = {
  children: React.ReactNode;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  rightSlot?: React.ReactNode;
  onClick?: () => void;
};

type ApiError = {
  status?: number;
  data?: unknown;
};

const mainNav: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'New Patient', href: '/patients/new', icon: UserPlus },
  { label: 'Daily Report', href: '/reports', icon: FileText },
  { label: 'WBC/Reminder Call', href: '/reminders', icon: Headphones },
  { label: 'Preset Print', href: '/preset-print', icon: Printer },

  // ✅ NEW: Assistants
  { label: 'Assistants', href: '/assistants', icon: Users },
];

const moreNav: NavItem[] = [{ label: 'Settings', href: '/settings', icon: Settings }];

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

const deriveTitleFromPath = (pathname: string): string => {
  if (pathname === '/') return 'Dashboard';
  if (pathname.startsWith('/patients/new')) return 'New Patient';
  if (pathname.startsWith('/patients/')) return 'Patient';
  if (pathname.startsWith('/patients')) return 'Patients';
  if (pathname.startsWith('/reports')) return 'Daily Report';
  if (pathname.startsWith('/reminders')) return 'WBC/Reminder Call';
  if (pathname.startsWith('/preset-print')) return 'Preset Print';

  // ✅ NEW:
  if (pathname.startsWith('/assistants')) return 'Assistants';

  if (pathname.startsWith('/settings')) return 'Settings';
  return 'Dashboard';
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '');
  return (s.slice(0, 2).toUpperCase() || 'U').trim();
}

function roleLabel(role?: string) {
  switch (role) {
    case 'ADMIN':
      return 'Admin';
    case 'DOCTOR':
      return 'Doctor';
    case 'RECEPTION':
      return 'Front Desk';
    default:
      return role ?? 'User';
  }
}

export default function ClinicShell({ children }: ClinicShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();

  const [isNewPatientOpen, setIsNewPatientOpen] = useState(false);
  const [visitModalPatientId, setVisitModalPatientId] = useState<string | null>(null);

  const pageTitle = deriveTitleFromPath(pathname);

  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const { dateLabel, timeLabel } = buildDateTimeLabels(now);
  const todayIso = clinicDateISO(now);

  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  useClinicRealtimeQuery(undefined, { skip: !canUseApi });

  const meQuery = useGetMeQuery(undefined, { skip: !canUseApi });
  const displayName = meQuery.data?.displayName ?? '—';
  const displayRole = roleLabel(
    meQuery.data?.role ?? (auth.status === 'authenticated' ? auth.role : undefined),
  );

  const printerAutoInitRan = useRef(false);
  useEffect(() => {
    if (!canUseApi) return;
    if (printerAutoInitRan.current) return;
    printerAutoInitRan.current = true;

    const run = async () => {
      const current = loadPrintSettings();
      if (current.printerName) return;

      try {
        const printers = await listPrinters();
        const match = pickPreferredPrinter(printers, ['POS-80C']);
        if (!match) return;

        savePrintSettings({ ...current, printerName: match });
        toast.success(`Printer auto-selected: ${match}`);
      } catch (e) {
        console.error('Auto printer select failed:', e);
      }
    };

    void run();
  }, [canUseApi]);

  const { data: patientSummary, isLoading: summaryLoading } = useGetDailyPatientSummaryQuery(
    todayIso,
    { skip: !canUseApi },
  );

  const newPatientsToday = patientSummary?.newPatients;
  const followupPatientsToday = patientSummary?.followupPatients;

  const totalPatientsDerived =
    (typeof newPatientsToday === 'number' ? newPatientsToday : 0) +
    (typeof followupPatientsToday === 'number' ? followupPatientsToday : 0);

  // -----------------------------
  // Patient Search
  // -----------------------------
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const resultsContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Track whether the *current term* has completed at least one request.
  // This prevents "No patients match..." from showing while we're still waiting.
  const [hasSettledForTerm, setHasSettledForTerm] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = searchTerm.trim();
      setDebouncedTerm(trimmed);

      // Reset pagination + results for the new term
      setCursor(undefined);
      setPatients([]);
      setHasMore(false);
      setNextCursor(null);

      // For a non-empty term, open dropdown and mark "not settled yet"
      setDropdownOpen(Boolean(trimmed));
      setHasSettledForTerm(trimmed.length === 0); // empty term is trivially "settled"
    }, 300);

    return () => window.clearTimeout(handle);
  }, [searchTerm]);

  const {
    currentData: searchCurrentData,
    isLoading: searchLoading,
    isFetching: searchFetching,
    error: searchRawError,
  } = useGetPatientsQuery(
    { query: debouncedTerm || undefined, limit: 10, cursor },
    {
      skip: !debouncedTerm || auth.status === 'unauthenticated',
      refetchOnMountOrArgChange: true,
    },
  );

  const isSearching = Boolean(debouncedTerm) && (searchLoading || searchFetching);

  useEffect(() => {
    // IMPORTANT: use currentData so we never apply stale results from previous args.
    if (!searchCurrentData) return;

    setHasSettledForTerm(true);

    setPatients((prev) => {
      const byId = new Map<string, Patient>();
      for (const p of prev) byId.set(p.patientId, p);
      for (const p of searchCurrentData.items) byId.set(p.patientId, p);
      return Array.from(byId.values());
    });

    setHasMore(Boolean(searchCurrentData.nextCursor));
    setNextCursor(searchCurrentData.nextCursor ?? null);
  }, [searchCurrentData]);

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
    setHasSettledForTerm(true);
  };

  const goToPatientProfile = (patientId: string) => {
    resetSearch();
    router.push(`/patients/${patientId}`);
  };

  const openVisitModal = (patientId: string) => {
    resetSearch();
    setVisitModalPatientId(patientId);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (patients.length === 1) openVisitModal(patients[0].patientId);
  };

  const handleProfileClick = (e: MouseEvent<HTMLButtonElement>, patientId: string) => {
    e.stopPropagation();
    goToPatientProfile(patientId);
  };

  const isAnyModalOpen = isNewPatientOpen || Boolean(visitModalPatientId);

  const showPanelSwitcher = auth.status === 'authenticated' && auth.role === 'ADMIN';
  const currentPanel = useMemo(() => deriveCurrentPanelFromPath(pathname), [pathname]);

  const handlePanelChange = (next: PanelKey) => {
    if (next === currentPanel) return;
    resetSearch();
    if (next === 'RECEPTION') router.replace('/');
    if (next === 'DOCTOR') router.replace('/doctor');
    if (next === 'ADMIN') router.replace('/admin');
  };

  // ✅ NEW: filter nav items (Assistants is ADMIN-only)
  const nav: NavItem[] = [
    ...mainNav
      .filter((i) => {
        if (i.href !== '/assistants') return true;
        return auth.status === 'authenticated' && auth.role === 'ADMIN';
      })
      .map((i) =>
        i.href === '/patients/new' ? { ...i, onClick: () => setIsNewPatientOpen(true) } : i,
      ),
  ];

  return (
    <AppShellChrome
      variant="clinic"
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
      nav={{ title: 'Manage', items: nav }}
      nav2={{ title: 'More', items: moreNav }}
      header={{
        title: pageTitle,
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
                  {isSearching && patients.length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
                  )}

                  {searchErrorMessage && !isSearching && (
                    <div className="px-3 py-2 text-xs text-red-600">{searchErrorMessage}</div>
                  )}

                  {!searchErrorMessage &&
                    !isSearching &&
                    patients.length === 0 &&
                    debouncedTerm &&
                    hasSettledForTerm && (
                      <div className="px-3 py-2 text-xs text-gray-500">
                        {auth.status === 'checking'
                          ? 'Checking session…'
                          : auth.status === 'unauthenticated'
                            ? 'Please log in to search patients.'
                            : 'No patients match your search.'}
                      </div>
                    )}

                  {!debouncedTerm && (
                    <div className="px-3 py-2 text-xs text-gray-500">
                      Type to search patients by phone or name.
                    </div>
                  )}

                  {patients.length > 0 && (
                    <ul className="divide-y">
                      {patients.map((p) => (
                        <li
                          key={p.patientId}
                          className="cursor-pointer px-3 py-2 text-xs hover:bg-gray-50"
                          onClick={() => openVisitModal(p.patientId)}
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
            <div className="flex items-center gap-3 text-[11px] text-gray-700">
              <div className="flex h-12 w-34 flex-col items-center justify-center rounded-xl bg-gray-50 px-3">
                <div className="flex w-full items-center justify-start gap-2 pl-0.5">
                  <UserPlus size={14} className="text-gray-500" />
                  <div className="text-[8px] text-gray-500">New Patients: </div>
                  <div className="text-sm font-semibold">
                    {auth.status !== 'authenticated'
                      ? '—'
                      : summaryLoading && !patientSummary
                        ? '…'
                        : (newPatientsToday ?? 0)}
                  </div>
                </div>
                <div className="flex w-full items-center justify-start gap-2">
                  <User size={14} className="text-gray-500" />
                  <div className="text-[8px] text-gray-500">Followup Patients: </div>
                  <div className="text-sm font-semibold">
                    {auth.status !== 'authenticated'
                      ? '—'
                      : summaryLoading && !patientSummary
                        ? '…'
                        : (followupPatientsToday ?? 0)}
                  </div>
                </div>
              </div>

              <div className="flex h-12 w-34 items-center justify-center gap-2 rounded-xl bg-gray-50 px-3 py-1">
                <Users />
                <div className="text-[10px] font-semibold text-gray-500">
                  <span className="block">Total</span>
                  <span className="block">Patients:</span>
                </div>
                <div className="text-2xl font-semibold">
                  {auth.status !== 'authenticated'
                    ? '—'
                    : summaryLoading && !patientSummary
                      ? '…'
                      : totalPatientsDerived}
                </div>
              </div>
            </div>
          </>
        ),
      }}
      footerUser={{
        user: {
          displayName: canUseApi
            ? meQuery.isFetching && !meQuery.data
              ? 'Loading…'
              : displayName
            : '—',
          avatarFallback: displayName && displayName !== '—' ? initials(displayName) : 'U',
          subLabel: <span>{canUseApi ? displayRole : '—'}</span>,
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
      <main className={['min-h-full', isAnyModalOpen ? 'overflow-hidden' : ''].join(' ')}>
        <div className={isAnyModalOpen ? 'overflow-hidden' : ''}>
          {children}

          {isNewPatientOpen && <NewPatientModal onClose={() => setIsNewPatientOpen(false)} />}

          {visitModalPatientId && (
            <RegisterVisitModal
              patientId={visitModalPatientId}
              onClose={() => setVisitModalPatientId(null)}
            />
          )}
        </div>
      </main>
    </AppShellChrome>
  );
}
