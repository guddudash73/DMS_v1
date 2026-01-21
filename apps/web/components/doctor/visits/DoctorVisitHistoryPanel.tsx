'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useGetPatientVisitsQuery } from '@/src/store/api';
import { clinicDateISO, formatClinicDateShort } from '@/src/lib/clinicTime';

import type { Visit } from '@dcm/types';
import { Calendar as CalendarIcon } from 'lucide-react';

const Calendar = dynamic(() => import('@/components/ui/calendar').then((m) => m.Calendar), {
  ssr: false,
  loading: () => <div className="h-64 w-72 animate-pulse rounded-2xl bg-gray-100" />,
});

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function getProp(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) return undefined;
  return obj[key];
}
function getPropString(obj: unknown, key: string): string | undefined {
  const v = getProp(obj, key);
  return typeof v === 'string' && v.trim() ? v : undefined;
}
function getPropNumber(obj: unknown, key: string): number | undefined {
  const v = getProp(obj, key);
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function anchorIdFromVisit(v: Visit): string | undefined {
  return getPropString(v, 'anchorVisitId') ?? getPropString(v, 'anchorId') ?? undefined;
}

function isZeroBilledVisit(v: Visit): boolean {
  return Boolean(getProp(v, 'zeroBilled'));
}

function isOfflineVisit(v: Visit): boolean {
  return Boolean(getProp(v, 'isOffline'));
}

function stageLabel(status?: Visit['status']) {
  if (status === 'QUEUED') return 'Waiting';
  if (status === 'IN_PROGRESS') return 'In Progress';
  if (status === 'DONE') return 'Done';
  return '—';
}

function stageBadgeClass(status?: Visit['status']) {
  if (status === 'QUEUED') return 'bg-pink-100 text-pink-700 border-pink-200';
  if (status === 'IN_PROGRESS') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (status === 'DONE') return 'bg-green-100 text-green-700 border-green-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function typeBadgeClass(kind: 'NEW' | 'FOLLOWUP') {
  if (kind === 'NEW') return 'bg-sky-100 text-sky-700 border-sky-200';
  return 'bg-violet-100 text-violet-700 border-violet-200';
}
function zeroBilledBadgeClass() {
  return 'bg-rose-100 text-rose-700 border-rose-200';
}
function offlineBadgeClass() {
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

export function DoctorVisitHistoryPanel(props: {
  patientId: string;
  onOpenVisit: (visitId: string) => void;
  onOpenRxQuick: (visitId: string) => void;
  onOpenXrayQuick: (visitId: string) => void;
}) {
  const { patientId, onOpenVisit, onOpenRxQuick, onOpenXrayQuick } = props;

  const [expanded, setExpanded] = React.useState(false);

  const [datePickerOpen, setDatePickerOpen] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(undefined);

  const selectedDateStr = React.useMemo(
    () => (selectedDate ? clinicDateISO(selectedDate) : null),
    [selectedDate],
  );

  const visitsQuery = useGetPatientVisitsQuery(patientId ?? '', {
    skip: !expanded || !patientId,
    refetchOnMountOrArgChange: true,
  });

  const allVisitsRaw = React.useMemo(() => {
    const items = (visitsQuery.data as any)?.items;
    return Array.isArray(items) ? (items as Visit[]) : [];
  }, [visitsQuery.data]);

  const allDoneVisits = React.useMemo(() => {
    if (!expanded) return [];
    return [...allVisitsRaw]
      .filter((v) => getPropString(v, 'status') === 'DONE')
      .sort(
        (a, b) =>
          (getPropNumber(b, 'updatedAt') ?? getPropNumber(b, 'createdAt') ?? 0) -
          (getPropNumber(a, 'updatedAt') ?? getPropNumber(a, 'createdAt') ?? 0),
      );
  }, [expanded, allVisitsRaw]);

  const filteredVisits = React.useMemo(() => {
    if (!expanded) return [];
    if (!selectedDateStr) return allDoneVisits;
    return allDoneVisits.filter((v) => getPropString(v, 'visitDate') === selectedDateStr);
  }, [expanded, allDoneVisits, selectedDateStr]);

  const visitById = React.useMemo(() => {
    const map = new Map<string, Visit>();
    for (const v of allDoneVisits) map.set(v.visitId, v);
    return map;
  }, [allDoneVisits]);

  const groups = React.useMemo(() => {
    if (!expanded) return { anchorsOrdered: [] as Array<{ anchor: Visit; followups: Visit[] }> };

    type Group = { anchor: Visit; followups: Visit[] };
    const anchorMap = new Map<string, Group>();

    // anchors = DONE visits without anchorId
    for (const v of filteredVisits) {
      const aId = anchorIdFromVisit(v);
      if (!aId) anchorMap.set(v.visitId, { anchor: v, followups: [] });
    }

    // attach followups
    for (const v of filteredVisits) {
      const aId = anchorIdFromVisit(v);
      if (!aId) continue;
      const g = anchorMap.get(aId);
      if (g) g.followups.push(v);
    }

    for (const g of anchorMap.values()) {
      g.followups.sort(
        (a, b) => (getPropNumber(a, 'createdAt') ?? 0) - (getPropNumber(b, 'createdAt') ?? 0),
      );
    }

    const anchorsOrdered = Array.from(anchorMap.values()).sort(
      (a, b) =>
        (getPropNumber(b.anchor, 'updatedAt') ?? getPropNumber(b.anchor, 'createdAt') ?? 0) -
        (getPropNumber(a.anchor, 'updatedAt') ?? getPropNumber(a.anchor, 'createdAt') ?? 0),
    );

    return { anchorsOrdered };
  }, [expanded, filteredVisits]);

  const dateLabel = selectedDateStr ?? 'Pick a date';

  return (
    <Card className="mt-4 w-full rounded-2xl border bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-gray-900">Previous visits</div>

        <div className="flex items-center gap-2">
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="w-55 justify-start gap-2 rounded-xl"
                disabled={!expanded}
                title={!expanded ? 'Expand to filter by date' : undefined}
              >
                <CalendarIcon className="h-4 w-4 cursor-pointer" />
                <span className={selectedDateStr ? 'text-gray-900' : 'text-gray-500'}>
                  {dateLabel}
                </span>
              </Button>
            </PopoverTrigger>

            <PopoverContent align="start" className="w-auto rounded-2xl p-2">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => {
                  setSelectedDate(d);
                  setDatePickerOpen(false);
                }}
              />
              {selectedDateStr ? (
                <div className="px-2 pb-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 rounded-xl text-xs"
                    onClick={() => {
                      setSelectedDate(undefined);
                      setDatePickerOpen(false);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              ) : null}
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            variant="outline"
            className="rounded-xl cursor-pointer"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Hide' : 'Show'}
          </Button>
        </div>
      </div>

      {!expanded ? (
        <div className="mt-3 text-xs text-gray-500">
          Expand to load and view the patient’s previous completed visits.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="font-semibold text-gray-600">Visit Date</TableHead>
                <TableHead className="font-semibold text-gray-600">Reason</TableHead>
                <TableHead className="font-semibold text-gray-600">Type</TableHead>
                <TableHead className="font-semibold text-gray-600">Stage</TableHead>
                <TableHead className="text-right font-semibold text-gray-600">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {visitsQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-gray-500">
                    Loading visits…
                  </TableCell>
                </TableRow>
              ) : groups.anchorsOrdered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-gray-500">
                    No visits found{selectedDateStr ? ` for ${selectedDateStr}` : ''}.
                  </TableCell>
                </TableRow>
              ) : (
                groups.anchorsOrdered.map((g) => {
                  const anchor = g.anchor;
                  const followups = g.followups;

                  return (
                    <React.Fragment key={anchor.visitId}>
                      <TableRow className="hover:bg-gray-50/60">
                        <TableCell className="px-6 py-4 align-top text-sm font-medium text-gray-900">
                          {formatClinicDateShort(String(getProp(anchor, 'visitDate') ?? ''))}
                        </TableCell>

                        <TableCell className="px-6 py-4 align-top">
                          <div className="truncate text-sm font-semibold text-gray-900">
                            {String(getProp(anchor, 'reason') ?? '—')}
                          </div>
                        </TableCell>

                        <TableCell className="px-6 py-4 align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`rounded-full px-4 py-1 text-[11px] font-semibold ${typeBadgeClass('NEW')}`}
                            >
                              NEW
                            </Badge>

                            {isZeroBilledVisit(anchor) ? (
                              <Badge
                                variant="outline"
                                className={`rounded-full px-4 py-1 text-[11px] font-semibold ${zeroBilledBadgeClass()}`}
                              >
                                ZERO BILLED
                              </Badge>
                            ) : null}

                            {isOfflineVisit(anchor) ? (
                              <Badge
                                variant="outline"
                                className={`rounded-full px-3 py-0.5 text-[10px] font-semibold ${offlineBadgeClass()}`}
                              >
                                OFFLINE
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>

                        <TableCell className="px-6 py-4 align-top">
                          <Badge
                            variant="outline"
                            className={`rounded-full px-4 py-1 text-xs font-semibold ${stageBadgeClass(
                              getProp(anchor, 'status') as Visit['status'] | undefined,
                            )}`}
                          >
                            {stageLabel(getProp(anchor, 'status') as Visit['status'] | undefined)}
                          </Badge>
                        </TableCell>

                        <TableCell className="px-6 py-4 align-top text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8 rounded-xl px-3 text-xs cursor-pointer"
                              onClick={() => onOpenRxQuick(anchor.visitId)}
                            >
                              View Rx
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8 rounded-xl px-3 text-xs cursor-pointer"
                              onClick={() => onOpenXrayQuick(anchor.visitId)}
                            >
                              X-rays
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8 rounded-xl px-3 text-xs cursor-pointer"
                              onClick={() => onOpenVisit(anchor.visitId)}
                            >
                              View
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {followups.map((f) => (
                        <TableRow key={f.visitId} className="hover:bg-gray-50/60">
                          <TableCell className="px-6 py-2 align-top">
                            {formatClinicDateShort(String(getProp(f, 'visitDate') ?? ''))}
                          </TableCell>

                          <TableCell className="px-6 py-2 align-top">
                            <div className="truncate text-sm font-semibold text-gray-900">
                              {String(getProp(f, 'reason') ?? '—')}
                            </div>
                            <div className="mt-0.5 text-[11px] text-gray-500">
                              Follow-up of: {String(getProp(anchor, 'reason') ?? '—')}
                            </div>
                          </TableCell>

                          <TableCell className="px-6 py-2 align-top">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={`rounded-full px-4 py-1 text-[11px] font-semibold ${typeBadgeClass('FOLLOWUP')}`}
                              >
                                FOLLOW UP
                              </Badge>

                              {isZeroBilledVisit(f) ? (
                                <Badge
                                  variant="outline"
                                  className={`rounded-full px-4 py-1 text-[11px] font-semibold ${zeroBilledBadgeClass()}`}
                                >
                                  ZERO BILLED
                                </Badge>
                              ) : null}

                              {isOfflineVisit(f) ? (
                                <Badge
                                  variant="outline"
                                  className={`rounded-full px-3 py-0.5 text-[10px] font-semibold ${offlineBadgeClass()}`}
                                >
                                  OFFLINE
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>

                          <TableCell className="px-6 py-2 align-top">
                            <Badge
                              variant="outline"
                              className={`rounded-full px-4 py-1 text-xs font-semibold ${stageBadgeClass(
                                getProp(f, 'status') as Visit['status'] | undefined,
                              )}`}
                            >
                              {stageLabel(getProp(f, 'status') as Visit['status'] | undefined)}
                            </Badge>
                          </TableCell>

                          <TableCell className="px-6 py-2 align-top text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="h-8 rounded-xl px-3 text-xs"
                                onClick={() => onOpenRxQuick(f.visitId)}
                              >
                                View Rx
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-8 rounded-xl px-3 text-xs"
                                onClick={() => onOpenXrayQuick(f.visitId)}
                              >
                                X-rays
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-8 rounded-xl px-3 text-xs"
                                onClick={() => onOpenVisit(f.visitId)}
                              >
                                View
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
