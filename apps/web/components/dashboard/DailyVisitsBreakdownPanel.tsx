// apps/web/components/dashboard/DailyVisitsBreakdownPanel.tsx
'use client';

import * as React from 'react';
import { useGetDailyVisitsBreakdownQuery } from '@/src/store/api';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { formatClinicDatePretty, formatClinicTimeFromMs } from '@/src/lib/clinicTime';

function statusBadge(status: string) {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset';
  if (status === 'DONE') return `${base} bg-emerald-50 text-emerald-700 ring-emerald-200`;
  if (status === 'IN_PROGRESS') return `${base} bg-amber-50 text-amber-700 ring-amber-200`;
  return `${base} bg-slate-50 text-slate-700 ring-slate-200`;
}

function tagBadge(tag?: string) {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset';
  if (tag === 'N') return `${base} bg-teal-50 text-teal-700 ring-teal-200`;
  if (tag === 'F') return `${base} bg-cyan-50 text-cyan-700 ring-cyan-200`;
  if (tag === 'Z') return `${base} bg-zinc-50 text-zinc-700 ring-zinc-200`;
  return `${base} bg-slate-50 text-slate-700 ring-slate-200`;
}

function tagLabel(tag?: string) {
  if (tag === 'N') return 'New';
  if (tag === 'F') return 'Followup';
  if (tag === 'Z') return 'Zero billed';
  return tag ?? '—';
}

function currency(v?: number) {
  if (typeof v !== 'number') return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v);
}

type Props = {
  date: string;
  onBack: () => void;
};

// ✅ What the UI needs (stable)
type DoctorGroupItem = {
  visitId: string;
  patientName: string;
  status: string;
  tag?: string;
  reason?: string;
  patientPhone?: string;
  patientGender?: string;
  billingAmount?: number;
  createdAt?: number;
};

type DoctorGroup = {
  doctorId: string;
  doctorName: string;
  total: number;
  items: DoctorGroupItem[];
};

// ✅ Generic “new” payload item
type ClinicWideItem = DoctorGroupItem & {
  doctorName?: string;
  doctorId?: string;
};

type NewPayload = {
  date: string;
  totalVisits: number;
  items: ClinicWideItem[];
};

type LegacyPayload = {
  date: string;
  totalVisits: number;
  doctors: DoctorGroup[];
};

function isNewPayload(x: unknown): x is NewPayload {
  return !!x && typeof x === 'object' && 'items' in (x as any) && Array.isArray((x as any).items);
}

function isLegacyPayload(x: unknown): x is LegacyPayload {
  return (
    !!x && typeof x === 'object' && 'doctors' in (x as any) && Array.isArray((x as any).doctors)
  );
}

// ✅ Normalize backend response into grouped doctors[]
function normalizeDoctors(data: unknown): DoctorGroup[] {
  if (!data) return [];

  // legacy (already grouped)
  if (isLegacyPayload(data)) {
    return (data.doctors ?? []).map((d) => ({
      doctorId: d.doctorId,
      doctorName: d.doctorName,
      total: d.total ?? d.items?.length ?? 0,
      items: (d.items ?? []).slice(),
    }));
  }

  // new (clinic-wide)
  if (isNewPayload(data)) {
    const items = (data.items ?? []).slice();

    // group by doctorId/doctorName if present, else "Clinic"
    const groups = new Map<string, DoctorGroup>();

    for (const it of items) {
      const key = (it.doctorId || it.doctorName || 'CLINIC').toString();
      const name = it.doctorName || (it.doctorId ? `Doctor (${it.doctorId})` : 'Clinic');

      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          doctorId: key,
          doctorName: name,
          total: 0,
          items: [],
        });
      }

      const g = groups.get(key)!;
      g.items.push({
        visitId: it.visitId,
        patientName: it.patientName,
        status: it.status,
        tag: it.tag,
        reason: it.reason,
        patientPhone: it.patientPhone,
        patientGender: it.patientGender,
        billingAmount: it.billingAmount,
        createdAt: it.createdAt,
      });
    }

    const out = Array.from(groups.values()).map((g) => ({
      ...g,
      total: g.items.length,
      items: g.items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    }));

    // Sort doctors by total desc
    out.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
    return out;
  }

  return [];
}

export default function DailyVisitsBreakdownPanel({ date, onBack }: Props) {
  const { data, isLoading, isFetching, isError } = useGetDailyVisitsBreakdownQuery(date);
  const loading = isLoading || isFetching;

  const [selectedDoctorId, setSelectedDoctorId] = React.useState<string>('ALL');

  React.useEffect(() => {
    setSelectedDoctorId('ALL');
  }, [date]);

  const doctors = React.useMemo(() => normalizeDoctors(data as unknown), [data]);

  const filteredDoctors = React.useMemo(() => {
    if (!data) return [];
    if (selectedDoctorId === 'ALL') return doctors;
    return doctors.filter((d) => d.doctorId === selectedDoctorId);
  }, [data, doctors, selectedDoctorId]);

  const totalDoctors = loading ? '…' : doctors.length;
  const totalVisits = loading
    ? '…'
    : ((data as any)?.totalVisits ?? doctors.reduce((s, d) => s + d.total, 0));

  const selectedDoctorName = React.useMemo(() => {
    if (selectedDoctorId === 'ALL') return 'All doctors';
    const doc = doctors.find((d) => d.doctorId === selectedDoctorId);
    return doc?.doctorName ?? 'Selected doctor';
  }, [doctors, selectedDoctorId]);

  return (
    <Card className="rounded-2xl border-none bg-white shadow-sm">
      <div className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Daily breakdown</div>
            <div className="text-lg font-semibold tracking-tight">
              {formatClinicDatePretty(date)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Doctors and patients handled on this day.
            </div>
          </div>

          <button
            onClick={onBack}
            className="rounded-full border bg-white px-3 py-1.5 text-xs shadow-sm hover:bg-slate-50"
          >
            ← Back
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Doctors</div>
            <div className="mt-0.5 text-base font-semibold">{totalDoctors}</div>
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total visits</div>
            <div className="mt-0.5 text-base font-semibold">{totalVisits}</div>
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Filter doctor</div>

            <div className="mt-1">
              <Select
                value={selectedDoctorId}
                onValueChange={(v) => setSelectedDoctorId(v)}
                disabled={loading || isError || doctors.length === 0}
              >
                <SelectTrigger className="h-9 w-full rounded-xl bg-white text-xs">
                  <SelectValue placeholder="Select doctor">{selectedDoctorName}</SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="ALL" className="rounded-lg text-xs">
                    All doctors
                  </SelectItem>
                  {doctors.map((doc) => (
                    <SelectItem
                      key={doc.doctorId}
                      value={doc.doctorId}
                      className="rounded-lg text-xs"
                    >
                      {doc.doctorName} ({doc.total})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="mt-4">
          {isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Couldn&apos;t load daily breakdown for this date.
            </div>
          ) : loading ? (
            <div className="space-y-3">
              <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
              <div className="h-28 w-full animate-pulse rounded-xl bg-slate-100" />
              <div className="h-28 w-full animate-pulse rounded-xl bg-slate-100" />
            </div>
          ) : !data || doctors.length === 0 ? (
            <div className="rounded-xl border bg-white px-3 py-3 text-sm text-muted-foreground">
              No visits found for this day.
            </div>
          ) : filteredDoctors.length === 0 ? (
            <div className="rounded-xl border bg-white px-3 py-3 text-sm text-muted-foreground">
              No visits found for the selected doctor.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredDoctors.map((doc) => (
                <div key={doc.doctorId} className="rounded-2xl border bg-white">
                  <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{doc.doctorName}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {doc.doctorId.slice(0, 8)}…{doc.doctorId.slice(-6)}
                      </div>
                    </div>

                    <div className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                      {doc.total} visits
                    </div>
                  </div>

                  <div className="max-h-[480px] overflow-y-auto">
                    <div className="divide-y">
                      {doc.items.map((v) => (
                        <div key={v.visitId} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="truncate text-sm font-semibold">
                                  {v.patientName}
                                </div>

                                <span className={statusBadge(v.status)}>{v.status}</span>
                                <span className={tagBadge(v.tag)}>{tagLabel(v.tag)}</span>
                              </div>

                              <div className="mt-1 text-xs text-muted-foreground">
                                <span className="font-medium text-slate-700">Reason:</span>{' '}
                                {v.reason ?? '—'}
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                {v.patientPhone ? (
                                  <span>
                                    <span className="text-slate-700">Phone:</span> {v.patientPhone}
                                  </span>
                                ) : null}
                                {v.patientGender ? (
                                  <span>
                                    <span className="text-slate-700">Gender:</span>{' '}
                                    {v.patientGender}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              <div className="text-[11px] text-muted-foreground">Billing</div>
                              <div className="mt-0.5 text-sm font-semibold">
                                {currency(v.billingAmount)}
                              </div>

                              <div className="mt-2 text-[11px] text-muted-foreground">
                                {typeof v.createdAt === 'number'
                                  ? formatClinicTimeFromMs(v.createdAt)
                                  : '—'}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
