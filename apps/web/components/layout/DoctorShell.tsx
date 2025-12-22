'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  FileStack,
  Bell,
  LogOut,
  Search,
  Calendar,
  Clock,
  Users,
  User,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

import { useDispatch } from 'react-redux';
import { setUnauthenticated } from '@/src/store/authSlice';
import { toast } from 'react-toastify';

import type { Patient } from '@dms/types';
import { useAuth } from '@/src/hooks/useAuth';
import {
  useGetPatientsQuery,
  useGetDailyPatientSummaryQuery,
  type ErrorResponse,
} from '@/src/store/api';

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

type ApiError = {
  status?: number;
  data?: unknown;
};

const doctorNav: NavItem[] = [
  { label: 'Dashboard', href: '/doctor', icon: LayoutDashboard },
  { label: 'Prescription', href: '/doctor/prescription', icon: FileText },
  { label: 'Documents', href: '/doctor/documents', icon: FileStack },
];

const doctorMoreNav: NavItem[] = [
  { label: 'Notifications', href: '/doctor/notifications', icon: Bell },
];

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

export default function DoctorShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch();
  const auth = useAuth();

  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
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

  const todayIso = now.toISOString().slice(0, 10);

  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;
  const { data: patientSummary, isLoading: summaryLoading } = useGetDailyPatientSummaryQuery(
    todayIso,
    {
      skip: !canUseApi,
    },
  );

  const totalPatients = patientSummary?.totalPatients ?? 0;

  const [activeStatus, setActiveStatus] = useState(true);

  const handleLogout = async () => {
    try {
      dispatch(setUnauthenticated());

      if (typeof window !== 'undefined') window.localStorage.removeItem('dms_auth');

      await fetch('/api/session', { method: 'DELETE' });

      toast.success('Logged out successfully.');
    } catch {
      toast.error('Failed to properly log out, but your local session was cleared.');
    } finally {
      router.push('/login');
    }
  };

  const doctorDisplay = useMemo(() => {
    const id = auth.userId ?? '';
    const short = id ? id.slice(0, 8) : 'Doctor';
    return {
      name: auth.role === 'DOCTOR' ? `Dr. ${short}` : short,
      roleLabel: 'Doctor',
      avatarFallback: short.slice(0, 1).toUpperCase(),
    };
  }, [auth.role, auth.userId]);

  const isActive = (href: string) => {
    if (href === '/doctor' && pathname === '/doctor') return true;
    return href !== '/doctor' && pathname.startsWith(href);
  };

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

  const handleRowClick = (patientId: string) => {
    goToPatientProfile(patientId);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (patients.length === 1) goToPatientProfile(patients[0].patientId);
  };

  const handleProfileClick = (e: MouseEvent<HTMLButtonElement>, patientId: string) => {
    e.stopPropagation();
    goToPatientProfile(patientId);
  };

  return (
    <div className="flex h-screen bg-white">
      <aside className="flex w-70 flex-col bg-white pb-5.5">
        <div className="flex w-full flex-col items-center justify-center px-6 pb-4 pt-6">
          <div className="relative h-18 w-32">
            <Image
              src="/dashboard-logo.png"
              alt="Sarangi Dentistry"
              width={128}
              height={48}
              className="object-contain"
              priority
              unoptimized
            />
          </div>

          <div className="w-32 space-y-1 pb-4 text-xs text-gray-500">
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
            <div className="space-y-2 pl-4">
              {doctorNav.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={active ? 'default' : 'ghost'}
                      className={`group mb-2 flex w-[96%] cursor-pointer justify-start gap-3 rounded-xl px-3 py-2 text-sm 2xl:w-[88%] ${
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
              {doctorMoreNav.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={active ? 'default' : 'ghost'}
                      className={`group mb-2 flex w-[96%] cursor-pointer justify-start gap-3 rounded-xl px-3 py-2 text-sm 2xl:w-[88%] ${
                        active
                          ? 'bg-black text-white hover:bg-black'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>

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

        <div className="mt-auto px-4">
          <Card className="flex flex-row items-center justify-between rounded-2xl border px-3 py-2 shadow-none">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{doctorDisplay.avatarFallback}</AvatarFallback>
              </Avatar>
              <div>
                <div className="text-xs font-semibold text-gray-900">{doctorDisplay.name}</div>
                <div className="text-[10px] text-gray-500">{doctorDisplay.roleLabel}</div>
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

      <div className="flex h-full grow items-center justify-start pr-6 min-w-auto lg:min-w-[84.4%]">
        <div className="flex h-[94%] flex-1 flex-col rounded-2xl bg-[#f1f3f5]">
          <header className="flex items-center gap-4 rounded-t-2xl border-b bg-[#f1f3f5] px-4 py-2 shadow-inner 2xl:px-12">
            <h1 className="text-2xl font-semibold text-gray-900">Doctor&apos;s Panel</h1>

            <div className="flex flex-1 justify-center 2xl:px-12">
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
                              onClick={() => handleRowClick(p.patientId)}
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
            </div>

            <div className="flex items-center gap-4">
              <div className="flex h-12 items-center justify-center gap-2 rounded-xl bg-gray-50 px-4 py-1">
                <Users className="h-5 w-5 text-gray-700" />
                <div className="text-[10px] font-semibold text-gray-500">
                  <span className="block">Total</span>
                  <span className="block">Patients:</span>
                </div>
                <div className="text-2xl font-semibold text-gray-900">
                  {auth.status !== 'authenticated'
                    ? '—'
                    : summaryLoading && !patientSummary
                      ? '…'
                      : totalPatients}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Label
                  htmlFor="doctor-active-status"
                  className="text-xs font-semibold text-gray-800"
                >
                  Active Status
                </Label>
                <Switch
                  id="doctor-active-status"
                  checked={activeStatus}
                  onCheckedChange={setActiveStatus}
                />
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto dms-scroll">
            <div className="relative min-h-full rounded-b-2xl bg-[#f1f3f5]">{children}</div>
          </main>
        </div>
      </div>

      <footer className="absolute bottom-0 right-0 px-8 pb-1 text-[10px] text-gray-400">
        Designed and Developed by @TCPL Group
      </footer>
    </div>
  );
}
