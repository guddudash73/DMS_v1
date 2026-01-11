// apps/web/components/dashboard/PatientsPanel.tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { FileText, Printer, ChevronRight } from 'lucide-react';
import { clinicDateISO } from '@/src/lib/clinicTime';

type PatientTag = 'N' | 'F';
type VisitStatus = 'QUEUED' | 'IN_PROGRESS' | 'DONE';

export type PatientsPanelItem = {
  visitId: string;
  patientName: string;
  doctorName: string;

  // ✅ only N/F now
  tag: PatientTag;

  // ✅ checkbox flag for zero-billed (preferred)
  // NOTE: upstream sometimes types this as false|undefined, so treat as boolean-ish.
  zeroBilled?: boolean;

  status: VisitStatus;
  billingAmount?: number;

  avatarUrl?: string | null;
  createdAt?: number;

  // ✅ tolerate legacy/alternate shapes without breaking UI
  // (some backends may send these)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
};

const TAG_META: Record<PatientTag, { label: string; className: string }> = {
  N: { label: 'N', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  F: { label: 'F', className: 'bg-pink-50 text-pink-700 ring-1 ring-pink-200' },
};

// ✅ Z should be gray (not amber)
const ZERO_BILLED_META = {
  label: 'Z',
  className: 'bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200',
};

const STATUS_META: Record<VisitStatus, { dotClass: string; label: string }> = {
  DONE: { dotClass: 'bg-emerald-500', label: 'Done' },
  IN_PROGRESS: { dotClass: 'bg-amber-400', label: 'On-chair' },
  QUEUED: { dotClass: 'bg-pink-500', label: 'Waiting' },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '');
  return (s.slice(0, 2).toUpperCase() || 'P').trim();
}

// ✅ Make Z visible even if the upstream field name differs.
// Preference order:
// 1) explicit checkbox flag: zeroBilled truthy
// 2) legacy flags: isZeroBilled / zero_billed / zeroBilledVisit / visit.zeroBilled
// 3) fallback: billingAmount <= 0 (only when a numeric billingAmount exists)
function isZeroBilled(p: PatientsPanelItem): boolean {
  // 1) preferred flag (avoid redundant Boolean() cast)
  if (p.zeroBilled) return true;

  // 2) legacy flags (read safely as unknown and coerce)
  const anyP = p as unknown as Record<string, unknown>;
  const visit = (anyP['visit'] as Record<string, unknown> | undefined) ?? undefined;

  const legacy =
    Boolean(anyP['isZeroBilled']) ||
    Boolean(anyP['zero_billed']) ||
    Boolean(anyP['zeroBilledVisit']) ||
    Boolean(visit?.['zeroBilled']);

  if (legacy) return true;

  // 3) fallback from billingAmount
  if (typeof p.billingAmount === 'number' && !Number.isNaN(p.billingAmount)) {
    return p.billingAmount <= 0;
  }

  return false;
}

type PatientsPanelProps = {
  title?: string;
  dateLabel?: string;
  dateIso?: string;

  patients?: PatientsPanelItem[];
  loading?: boolean;
  canUseApi?: boolean;
};

function SkeletonPill({ i }: { i: number }) {
  return (
    <li key={`sk-${i}`} className="rounded-2xl px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gray-100" />
          <div className="flex flex-col gap-2">
            <div className="h-3 w-40 rounded bg-gray-100" />
            <div className="h-3 w-28 rounded bg-gray-100" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-gray-100" />
          <div className="h-8 w-8 rounded-xl bg-gray-100" />
        </div>
      </div>
    </li>
  );
}

function PlaceholderPill({ label, i }: { label: string; i: number }) {
  return (
    <li key={`ph-${i}`} className="rounded-2xl px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-full bg-gray-50 ring-1 ring-gray-200" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-gray-300">{label}</div>
            <div className="mt-0.5 text-[11px] text-gray-200">—</div>
          </div>
        </div>
        <div className="flex items-center gap-2 opacity-30">
          <span className="h-9 w-9 rounded-xl bg-gray-50 ring-1 ring-gray-200" />
          <span className="h-9 w-9 rounded-xl bg-gray-50 ring-1 ring-gray-200" />
        </div>
      </div>
    </li>
  );
}

function RealPill({ p, onOpen }: { p: PatientsPanelItem; onOpen: (visitId: string) => void }) {
  const statusMeta = STATUS_META[p.status];
  const tagMeta = TAG_META[p.tag];

  const showPrint = typeof p.billingAmount === 'number' && !Number.isNaN(p.billingAmount);
  const showPaper = p.status === 'DONE';

  const showZ = isZeroBilled(p);

  return (
    <li key={p.visitId}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(p.visitId)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onOpen(p.visitId);
        }}
        className={cn(
          'group w-full rounded-2xl px-3 py-2',
          'cursor-pointer select-none text-left',
          'transition-colors hover:bg-gray-50',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-black/10',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-9 w-9">
              {p.avatarUrl ? (
                <AvatarImage src={p.avatarUrl} alt={p.patientName} />
              ) : (
                <AvatarFallback className="bg-gray-100 text-gray-800">
                  {initials(p.patientName)}
                </AvatarFallback>
              )}
            </Avatar>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="truncate text-[13px] font-semibold text-gray-900">
                  {p.patientName}
                </div>
                <span
                  className={cn('h-2 w-2 shrink-0 rounded-full', statusMeta.dotClass)}
                  title={statusMeta.label}
                />
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                <span className="truncate">{p.doctorName}</span>

                {/* ✅ show only N/F */}
                <Badge
                  variant="secondary"
                  className={cn(
                    'h-5 shrink-0 rounded-full px-2 text-[10px] font-semibold',
                    tagMeta.className,
                  )}
                  title={p.tag === 'N' ? 'New (N)' : 'Follow-up (F)'}
                >
                  {tagMeta.label}
                </Badge>

                {/* ✅ show Z next to N/F, in gray */}
                {showZ ? (
                  <Badge
                    variant="secondary"
                    className={cn(
                      'h-5 shrink-0 rounded-full px-2 text-[10px] font-semibold',
                      ZERO_BILLED_META.className,
                    )}
                    title="Zero billed (Z)"
                  >
                    {ZERO_BILLED_META.label}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {showPrint ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                title="Checkout done - Print available"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(p.visitId);
                }}
              >
                <Printer className="h-4 w-4 text-gray-700" />
              </Button>
            ) : (
              <span className="h-9 w-9" />
            )}

            {showPaper ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                title="Visit done - Documents available"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(p.visitId);
                }}
              >
                <FileText className="h-4 w-4 text-gray-700" />
              </Button>
            ) : (
              <span className="h-9 w-9" />
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export default function PatientsPanel({
  title = 'Patients.',
  dateLabel,
  dateIso,
  patients = [],
  loading = false,
  canUseApi = true,
}: PatientsPanelProps) {
  const router = useRouter();

  const goToVisit = (visitId: string) => {
    router.push(`/visits/${visitId}`);
  };

  const goToViewAll = () => {
    const d = dateIso ?? clinicDateISO(new Date());
    router.push(`/visits/day/${d}`);
  };

  const VISIBLE_ROWS = 4;

  const visiblePatients = patients.slice(0, VISIBLE_ROWS);
  const placeholdersNeeded = Math.max(0, VISIBLE_ROWS - visiblePatients.length);

  const shouldScroll = patients.length > VISIBLE_ROWS;

  return (
    <Card className="w-full rounded-2xl border-none bg-white pt-4 shadow-sm h-full">
      <div className="flex items-start justify-between gap-3 px-4 pb-2">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {dateLabel ? <div className="text-[11px] text-gray-500">{dateLabel}</div> : null}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 rounded-xl px-2 text-[12px] text-gray-700 hover:bg-gray-50"
          onClick={goToViewAll}
          disabled={loading || !canUseApi}
          title="View all visits for this day"
        >
          View all
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

      <div
        className={cn('px-2 pb-4', shouldScroll ? 'max-h-[268px] overflow-y-auto dms-scroll' : '')}
      >
        <ul className="space-y-1">
          {loading ? (
            Array.from({ length: VISIBLE_ROWS }).map((_, i) => <SkeletonPill key={i} i={i} />)
          ) : !canUseApi ? (
            <>
              <li className="px-3 py-3">
                <div className="rounded-2xl bg-gray-50 px-3 py-3 text-xs text-gray-500">
                  Please login to see patients.
                </div>
              </li>
              {Array.from({ length: VISIBLE_ROWS - 1 }).map((_, i) => (
                <PlaceholderPill key={i} i={i} label="Patients" />
              ))}
            </>
          ) : (
            <>
              {visiblePatients.map((p) => (
                <RealPill key={p.visitId} p={p} onOpen={goToVisit} />
              ))}

              {Array.from({ length: placeholdersNeeded }).map((_, i) => (
                <PlaceholderPill key={`ph-${i}`} i={i} label="Patients" />
              ))}
            </>
          )}

          {!loading && canUseApi && patients.length > VISIBLE_ROWS
            ? patients
                .slice(VISIBLE_ROWS)
                .map((p) => <RealPill key={p.visitId} p={p} onOpen={goToVisit} />)
            : null}
        </ul>
      </div>
    </Card>
  );
}
