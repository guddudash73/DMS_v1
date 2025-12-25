'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { FileText, Printer } from 'lucide-react';

type PatientTag = 'N' | 'F' | 'Z' | 'O';
type VisitStatus = 'QUEUED' | 'IN_PROGRESS' | 'DONE';

export type PatientsPanelItem = {
  visitId: string;
  patientName: string;
  doctorName: string;
  tag: PatientTag;
  status: VisitStatus;
  billingAmount?: number;
  avatarUrl?: string | null;
  createdAt?: number;
};

const TAG_META: Record<PatientTag, { label: string; className: string }> = {
  N: { label: 'N', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  F: { label: 'F', className: 'bg-pink-50 text-pink-700 ring-1 ring-pink-200' },
  Z: { label: 'Z', className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
  O: { label: 'O', className: 'bg-slate-50 text-slate-700 ring-1 ring-slate-200' },
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

type PatientsPanelProps = {
  title?: string;
  dateLabel?: string;

  // ✅ Controlled mode props (what your page.tsx passes)
  patients?: PatientsPanelItem[];
  loading?: boolean;
  canUseApi?: boolean;
};

export default function PatientsPanel({
  title = 'Patients.',
  dateLabel,
  patients = [],
  loading = false,
  canUseApi = true,
}: PatientsPanelProps) {
  const router = useRouter();

  const empty = !loading && patients.length === 0;

  const goToVisit = (visitId: string) => {
    router.push(`/visits/${visitId}`);
  };

  return (
    <Card className="flex h-full flex-col rounded-2xl border-none bg-white pt-4 shadow-sm">
      <div className="flex items-center justify-between px-4 pb-2">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {dateLabel ? <div className="text-[11px] text-gray-500">{dateLabel}</div> : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 dms-scroll">
        <ul className="space-y-1">
          {loading ? (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <li
                  key={`sk-${i}`}
                  className="flex items-center justify-between rounded-2xl px-3 py-2"
                >
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
                </li>
              ))}
            </>
          ) : !canUseApi ? (
            <li className="px-3 py-3">
              <div className="rounded-2xl bg-gray-50 px-3 py-3 text-xs text-gray-500">
                Please login to see patients.
              </div>
            </li>
          ) : empty ? (
            <li className="px-3 py-3">
              <div className="rounded-2xl bg-gray-50 px-3 py-3 text-xs text-gray-500">
                No patients found for this date.
              </div>
            </li>
          ) : (
            patients.map((p) => {
              const statusMeta = STATUS_META[p.status];
              const tagMeta = TAG_META[p.tag];

              // ✅ show only when actually allowed
              const showPrint =
                typeof p.billingAmount === 'number' && !Number.isNaN(p.billingAmount);
              const showPaper = p.status === 'DONE';

              return (
                <li key={p.visitId}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => goToVisit(p.visitId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') goToVisit(p.visitId);
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

                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
                            <span className="truncate">{p.doctorName}</span>
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
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {showPrint ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={cn(
                              'h-9 w-9 rounded-xl',
                              'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
                            )}
                            title="Checkout done - Print available"
                            onClick={(e) => {
                              e.stopPropagation();
                              goToVisit(p.visitId);
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
                            className={cn(
                              'h-9 w-9 rounded-xl',
                              'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
                            )}
                            title="Visit done - Documents available"
                            onClick={(e) => {
                              e.stopPropagation();
                              goToVisit(p.visitId);
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
            })
          )}
        </ul>
      </div>
    </Card>
  );
}
