'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  UserPlus,
  User,
  FileText,
  Headphones,
  FileStack,
  Bell,
  LogOut,
  Users,
  Search,
  Calendar,
  Clock,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useDispatch } from 'react-redux';
import { setUnauthenticated } from '@/src/store/authSlice';
import { toast } from 'react-toastify';
import type { Patient } from '@dms/types';
import {
  useGetPatientsQuery,
  type ErrorResponse,
  useGetDailyPatientSummaryQuery,
} from '@/src/store/api';
import { useAuth } from '@/src/hooks/useAuth';

type ClinicShellProps = {
  title: string;
  children: React.ReactNode;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

type ApiError = {
  status?: number;
  data?: unknown;
};

const mainNav: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'New Patient', href: '/patients/new', icon: UserPlus },
  { label: 'Daily Report', href: '/reports/daily', icon: FileText },
  { label: 'WBC/Reminder Call', href: '/reminders', icon: Headphones },
  { label: 'Documents', href: '/documents', icon: FileStack },
];

const moreNav: NavItem[] = [{ label: 'Notifications', href: '/notifications', icon: Bell }];

// Small helper for 1st/2nd/3rd/4th, etc.
const getDaySuffix = (day: number) => {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
};

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

export default function ClinicShell({ title, children }: ClinicShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch();

  const auth = useAuth();

  // ---- LIVE DATE/TIME STATE ----
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(id);
  }, []);

  const weekday = now.toLocaleDateString('en-US', { weekday: 'short' });
  const month = now.toLocaleDateString('en-US', { month: 'short' });
  const day = now.getDate();
  const year = now.getFullYear();
  const dateLabel = `${weekday} · ${day}${getDaySuffix(day)} ${month} ${year}`;

  const timeLabel = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  // Today in YYYY-MM-DD for backend reports
  const todayIso = now.toISOString().slice(0, 10);

  // ---- DASHBOARD PATIENT SUMMARY (BACKEND ROUTE) ----
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const { data: patientSummary, isLoading: summaryLoading } = useGetDailyPatientSummaryQuery(
    todayIso,
    {
      skip: !canUseApi,
      // keep this reasonably fresh – 15s is plenty for these counters
      pollingInterval: 15000,
    },
  );

  const newPatientsToday = patientSummary?.newPatients;
  const followupPatientsToday = patientSummary?.followupPatients;
  const totalPatients = patientSummary?.totalPatients;

  const isActive = (href: string) => {
    // Dashboard should be active on exact "/"
    if (href === '/' && pathname === '/') return true;
    return href !== '/' && pathname.startsWith(href);
  };

  const handleLogout = async () => {
    try {
      // 1) Clear Redux state
      dispatch(setUnauthenticated());

      // 2) Clear localStorage (match STORAGE_KEY in useAuth)
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('dms_auth');
      }

      // 3) Clear httpOnly session cookie on the server
      await fetch('/api/session', { method: 'DELETE' });

      toast.success('Logged out successfully.');
    } catch {
      toast.error('Failed to properly log out, but your local session was cleared.');
    } finally {
      router.push('/login');
    }
  };

  // ---- PATIENT SEARCH STATE (GLOBAL SEARCH BOX) ----
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const resultsContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Debounce input a bit (300ms)
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = searchTerm.trim();
      setDebouncedTerm(trimmed);
      // reset pagination + results whenever the term changes
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
    {
      query: debouncedTerm || undefined,
      limit: 10,
      cursor,
    },
    {
      // don’t hit the API if there’s no term OR we know user is unauthenticated
      skip: !debouncedTerm || auth.status === 'unauthenticated',
    },
  );

  // Accumulate pages of patients
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

  // Infinite scroll inside dropdown
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
        if (cursor === nextCursor) return; // avoid loops

        setCursor(nextCursor);
      },
      {
        root,
        rootMargin: '0px',
        threshold: 1.0,
      },
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
    router.push(`/patients/${patientId}`);
  };

  const goToCreateVisit = (patientId: string) => {
    resetSearch();
    // Assumes you will/now have a create-visit page that accepts patientId
    router.push(`/visits/new?patientId=${patientId}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (patients.length === 1) {
      // Single result → create visit
      goToCreateVisit(patients[0].patientId);
    }
    // if multiple, we just show the dropdown; user will click one
  };

  const handleProfileClick = (e: MouseEvent<HTMLButtonElement>, patientId: string) => {
    e.stopPropagation(); // don’t trigger the row’s create-visit handler
    goToPatientProfile(patientId);
  };

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col bg-white pb-5.5">
        <div className="flex flex-col w-full items-center justify-center px-6 pt-6 pb-4">
          <div className="relative h-18 w-32">
            <Image
              src="/dashboard-logo.png"
              alt="Sarangi Dentistry"
              fill
              className="object-contain"
              priority
            />
          </div>
          {/* Date / small status area – dynamic now with icons */}
          <div className="w-32 pb-4 text-xs text-gray-500 space-y-1">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>{dateLabel}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>{timeLabel}</span>
            </div>
          </div>
        </div>

        <nav className="w-full flex-1 space-y-4 px-3">
          <div>
            <div className="px-3 pb-2 text-xs font-semibold tracking-wide text-gray-400">
              Manage
            </div>
            <div className="space-y-2 pl-4">
              {mainNav.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={active ? 'default' : 'ghost'}
                      className={`group mb-2 flex w-[96%] 2xl:w-[88%] cursor-pointer justify-start gap-3 rounded-xl px-3 py-2 text-sm ${
                        active
                          ? 'bg-black text-white hover:bg-black'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Button>
                  </Link>
                );
              })}
            </div>
          </div>

          <div>
            <div className="px-3 pb-2 text-xs font-semibold tracking-wide text-gray-400">More</div>
            <div className="space-y-2 pl-4">
              {moreNav.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={active ? 'default' : 'ghost'}
                      className={`group mb-2 flex w-[96%] 2xl:w-[88%] cursor-pointer justify-start gap-3 rounded-xl px-3 py-2 text-sm ${
                        active
                          ? 'bg-black text-white hover:bg-black'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>

                      {/* simple red dot for unread notifications */}
                      {item.label === 'Notifications' && (
                        <span className="ml-auto inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-semibold text-white">
                          1
                        </span>
                      )}
                    </Button>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        {/* User card + logout */}
        <div className="mt-auto px-4">
          <Card className="flex items-center justify-between rounded-2xl border px-3 py-2 shadow-none flex-row">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback>G</AvatarFallback>
              </Avatar>
              <div>
                <div className="text-xs font-semibold text-gray-900">Guddu Dash</div>
                <div className="text-[10px] text-gray-500">Front Desk</div>
              </div>
            </div>
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-gray-500 hover:bg-gray-100"
            >
              <LogOut className="h-3 w-3" />
            </Button>
          </Card>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex h-full grow items-center justify-start pr-6">
        <div className="flex h-[94%] flex-1 flex-col rounded-2xl bg-[#f1f3f5]">
          {/* Top header bar */}
          <header className="flex items-center gap-4 rounded-t-2xl border-b bg-[#f1f3f5] px-4 2xl:px-12 py-2 shadow-inner">
            <h1 className="m4-8 text-2xl font-semibold text-gray-900">{title}</h1>

            {/* Search */}
            <div className="flex flex-1 justify-center 2xl:px-12">
              <form
                className="relative flex w-full max-w-2xl items-center gap-2 rounded-full border bg-white pl-2 pr-1 py-1"
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

                {/* Results dropdown */}
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
                              onClick={() => goToCreateVisit(p.patientId)}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex flex-col">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-gray-900">{p.name}</span>
                                    <span className="text-[10px] text-gray-500">
                                      ID: {p.patientId}
                                    </span>
                                  </div>
                                  <div className="mt-0.5 text-[11px] text-gray-600">
                                    {p.phone ?? 'No phone'} · {p.gender ?? 'Unknown'}
                                  </div>
                                </div>

                                {/* Profile icon – click ONLY this to go to patient info */}
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

                      {/* sentinel for infinite scroll */}
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
            </div>

            {/* Small summary block on the right */}
            <div className="flex items-center gap-3 text-[11px] text-gray-700">
              <div className="flex h-12 w-34 flex-col items-center justify-center rounded-xl bg-gray-50 px-3">
                <div className="flex w-full items-center justify-start gap-2 pl-0.5">
                  <UserPlus size={14} className="text-gray-500" />
                  <div className="text-[8px] text-gray-500">New Patients Today</div>
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
                  <div className="text-[8px] text-gray-500">Followup Patients</div>
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
                      : (totalPatients ?? 0)}
                </div>
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10 dms-scroll">
            <div className="min-h-full rounded-3xl bg-[#f1f3f5]">{children}</div>
          </main>
        </div>
      </div>
      <footer className="absolute bottom-0 right-0 px-8 pb-1 text-[10px] text-gray-400">
        Designed and Developed by @TCPL Group
      </footer>
    </div>
  );
}
