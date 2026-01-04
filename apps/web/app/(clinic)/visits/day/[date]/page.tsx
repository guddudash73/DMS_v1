// apps/web/app/(clinic)/visits/day/[date]/page.tsx
'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';

import { ArrowLeft, Search, Clock, Stethoscope } from 'lucide-react';
import { useGetDailyVisitsBreakdownQuery } from '@/src/store/api';
import { useAuth } from '@/src/hooks/useAuth';
import { formatClinicTimeFromMs } from '@/src/lib/clinicTime';

type VisitStatus = 'QUEUED' | 'IN_PROGRESS' | 'DONE';
type PatientTag = 'N' | 'F' | 'Z' | 'O';

const TAG_META: Record<PatientTag, { label: string; className: string }> = {
  N: { label: 'N', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  F: { label: 'F', className: 'bg-pink-50 text-pink-700 ring-1 ring-pink-200' },
  Z: { label: 'Z', className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
  O: { label: 'O', className: 'bg-slate-50 text-slate-700 ring-1 ring-slate-200' },
};

const STATUS_LABEL: Record<VisitStatus, string> = {
  QUEUED: 'Waiting',
  IN_PROGRESS: 'On-chair',
  DONE: 'Done',
};

const STATUS_DOT: Record<VisitStatus, string> = {
  QUEUED: 'bg-pink-500',
  IN_PROGRESS: 'bg-amber-400',
  DONE: 'bg-emerald-500',
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '');
  return (s.slice(0, 2).toUpperCase() || 'P').trim();
}

function formatTime(ms?: number) {
  if (!ms) return '';
  return formatClinicTimeFromMs(ms);
}

type Row = {
  visitId: string;
  patientName: string;
  doctorName: string;
  status: VisitStatus;
  tag: PatientTag;
  createdAt?: number;
  billingAmount?: number;
};

// ✅ Support both API payloads (legacy grouped + new clinic-wide)
type BreakdownItem = {
  visitId: string;
  patientName: string;
  status: string;
  tag?: string;
  createdAt?: number;
  billingAmount?: number;
  doctorName?: string;
};

type NewBreakdownResponse = {
  date: string;
  totalVisits: number;
  items: BreakdownItem[];
};

type LegacyBreakdownDoctor = {
  doctorId: string;
  doctorName: string;
  items?: BreakdownItem[];
};

type LegacyBreakdownResponse = {
  date: string;
  totalVisits: number;
  doctors: LegacyBreakdownDoctor[];
};

function hasItemsPayload(x: unknown): x is NewBreakdownResponse {
  return !!x && typeof x === 'object' && 'items' in (x as any) && Array.isArray((x as any).items);
}
function hasDoctorsPayload(x: unknown): x is LegacyBreakdownResponse {
  return (
    !!x && typeof x === 'object' && 'doctors' in (x as any) && Array.isArray((x as any).doctors)
  );
}

export default function VisitsByDayPage() {
  const router = useRouter();
  const params = useParams<{ date: string }>();
  const date = params?.date;

  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const q = useGetDailyVisitsBreakdownQuery(date, { skip: !canUseApi || !date });

  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<'ALL' | VisitStatus>('ALL');

  const rows: Row[] = React.useMemo(() => {
    const dataUnknown = q.data as unknown;

    const items: BreakdownItem[] = (() => {
      if (hasItemsPayload(dataUnknown)) {
        return (dataUnknown.items ?? []).slice();
      }
      if (hasDoctorsPayload(dataUnknown)) {
        const doctors = dataUnknown.doctors ?? [];
        return doctors.flatMap((d) =>
          (d.items ?? []).map((it) => ({
            ...it,
            doctorName: it.doctorName ?? d.doctorName ?? 'Clinic',
          })),
        );
      }
      return [];
    })();

    const flat: Row[] = items.map((it) => ({
      visitId: it.visitId,
      patientName: it.patientName ?? '—',
      doctorName: it.doctorName ?? 'Clinic',
      status: (it.status as VisitStatus) ?? 'QUEUED',
      tag: ((it.tag ?? 'O') as PatientTag) ?? 'O',
      createdAt: it.createdAt,
      billingAmount: it.billingAmount,
    }));

    flat.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return flat;
  }, [q.data]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();

    return rows.filter((r) => {
      if (status !== 'ALL' && r.status !== status) return false;
      if (!needle) return true;

      return (
        r.patientName.toLowerCase().includes(needle) || r.doctorName.toLowerCase().includes(needle)
      );
    });
  }, [rows, query, status]);

  const grouped = React.useMemo(() => {
    const g: Record<VisitStatus, Row[]> = { QUEUED: [], IN_PROGRESS: [], DONE: [] };
    for (const r of filtered) g[r.status].push(r);

    (Object.keys(g) as VisitStatus[]).forEach((k) => {
      g[k].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    });

    return g;
  }, [filtered]);

  const total = rows.length;

  const goVisit = (visitId: string) => router.push(`/visits/${visitId}`);

  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col gap-4">
        <Card className="rounded-2xl border-none bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={() => router.back()}
                title="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-lg font-semibold text-gray-900">Visits</h1>
                  <Badge variant="secondary" className="rounded-full">
                    {date}
                  </Badge>
                </div>
                <div className="mt-0.5 text-[12px] text-gray-500">
                  {q.isFetching || q.isLoading ? 'Loading…' : `${total} total visits`}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-[280px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search patient or doctor…"
                  className="h-10 rounded-xl pl-9"
                />
              </div>

              <div className="flex gap-2">
                {(['ALL', 'QUEUED', 'IN_PROGRESS', 'DONE'] as const).map((k) => (
                  <Button
                    key={k}
                    type="button"
                    variant={status === k ? 'default' : 'secondary'}
                    className={cn('h-10 rounded-xl px-3 text-[12px]', status !== k && 'bg-gray-50')}
                    onClick={() => setStatus(k)}
                  >
                    {k === 'ALL'
                      ? 'All'
                      : k === 'IN_PROGRESS'
                        ? 'On-chair'
                        : k === 'QUEUED'
                          ? 'Waiting'
                          : 'Done'}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <div className="flex-1">
          {!canUseApi ? (
            <Card className="rounded-2xl border-none bg-white p-4 shadow-sm">
              <div className="text-sm text-gray-600">Please login to see visits.</div>
            </Card>
          ) : q.isLoading ? (
            <Card className="rounded-2xl border-none bg-white p-4 shadow-sm">
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-14 w-full rounded-2xl bg-gray-100" />
                ))}
              </div>
            </Card>
          ) : filtered.length === 0 ? (
            <Card className="rounded-2xl border-none bg-white p-6 shadow-sm">
              <div className="text-sm font-medium text-gray-900">No visits match your filters.</div>
              <div className="mt-1 text-sm text-gray-500">
                Try clearing search or selecting “All”.
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {(Object.keys(grouped) as VisitStatus[]).map((k) => {
                const items = grouped[k];
                if (items.length === 0) return null;

                return (
                  <Card key={k} className="rounded-2xl border-none bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_DOT[k])} />
                        <div className="text-sm font-semibold text-gray-900">{STATUS_LABEL[k]}</div>
                      </div>
                      <Badge variant="secondary" className="rounded-full">
                        {items.length}
                      </Badge>
                    </div>

                    <ul className="space-y-2">
                      {items.map((r) => {
                        const tagMeta = TAG_META[r.tag];
                        const t = formatTime(r.createdAt);

                        return (
                          <li key={r.visitId}>
                            <button
                              type="button"
                              onClick={() => goVisit(r.visitId)}
                              className={cn(
                                'w-full rounded-2xl px-3 py-3 text-left',
                                'transition-colors hover:bg-gray-50',
                                'focus:outline-none focus-visible:ring-2 focus-visible:ring-black/10',
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <Avatar className="h-10 w-10">
                                    <AvatarFallback className="bg-gray-100 text-gray-800">
                                      {initials(r.patientName)}
                                    </AvatarFallback>
                                  </Avatar>

                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <div className="truncate text-[14px] font-semibold text-gray-900">
                                        {r.patientName}
                                      </div>
                                      <Badge
                                        variant="secondary"
                                        className={cn(
                                          'h-5 rounded-full px-2 text-[10px] font-semibold',
                                          tagMeta.className,
                                        )}
                                      >
                                        {tagMeta.label}
                                      </Badge>
                                    </div>

                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-500">
                                      <span className="inline-flex items-center gap-1">
                                        <Stethoscope className="h-4 w-4" />
                                        <span className="truncate">{r.doctorName}</span>
                                      </span>

                                      {t ? (
                                        <span className="inline-flex items-center gap-1">
                                          <Clock className="h-4 w-4" />
                                          {t}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>

                                <div className="shrink-0 text-[12px] text-gray-500">
                                  #{r.visitId.slice(0, 6)}
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
