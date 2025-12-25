// apps/web/components/prescription/PrescriptionWorkspace.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RxLineType, Visit } from '@dms/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PrescriptionPreview } from './PrescriptionPreview';
import { PrescriptionPrintSheet } from './PrescriptionPrintSheet';
import { MedicinesEditor } from './MedicinesEditor';
import { XrayUploader } from '@/components/xray/XrayUploader';
import { XrayGallery } from '@/components/xray/XrayGallery';

import {
  useUpsertVisitRxMutation,
  useGetVisitRxQuery,
  useStartVisitRxRevisionMutation,
  useUpdateRxByIdMutation,
  useGetPatientVisitsQuery,
} from '@/src/store/api';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { PaginationControl } from '@/components/ui/pagination-control';

import { Calendar as CalendarIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Props = {
  visitId: string;
  patientId?: string;
  patientName?: string;
  patientPhone?: string;
  doctorName?: string;
  visitDateLabel?: string;
  visitStatus?: 'QUEUED' | 'IN_PROGRESS' | 'DONE';
};

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function PrescriptionWorkspace(props: Props) {
  const { visitId, patientId, patientName, patientPhone, doctorName, visitDateLabel, visitStatus } =
    props;

  const router = useRouter();

  // ---------------------------
  // Prescription editor state
  // ---------------------------
  const [lines, setLines] = useState<RxLineType[]>([]);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [activeRxId, setActiveRxId] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  const lastHash = useRef<string>('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rxQuery = useGetVisitRxQuery({ visitId }, { skip: !visitId });
  const [upsert] = useUpsertVisitRxMutation();
  const [startRevision, startRevisionState] = useStartVisitRxRevisionMutation();
  const [updateRxById] = useUpdateRxByIdMutation();

  // Hydrate from server once
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!rxQuery.isSuccess) return;

    const rx = rxQuery.data?.rx ?? null;
    if (rx) {
      setLines(rx.lines ?? []);
      setActiveRxId(rx.rxId);
      lastHash.current = JSON.stringify(rx.lines ?? []);
    } else {
      setLines([]);
      setActiveRxId(null);
      lastHash.current = JSON.stringify([]);
    }

    hydratedRef.current = true;
    setState('idle');
  }, [rxQuery.isSuccess, rxQuery.data]);

  const hash = useMemo(() => JSON.stringify(lines), [lines]);

  const canAutosave =
    hydratedRef.current &&
    lines.length > 0 &&
    hash !== lastHash.current &&
    (visitStatus !== 'DONE' || !!activeRxId);

  useEffect(() => {
    if (!canAutosave) return;

    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setState('saving');
      try {
        if (visitStatus === 'DONE') {
          await updateRxById({ rxId: activeRxId!, lines }).unwrap();
        } else {
          const res = await upsert({ visitId, lines }).unwrap();
          setActiveRxId(res.rxId);
        }

        lastHash.current = hash;
        setState('saved');
      } catch {
        setState('error');
      }
    }, 900);

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [canAutosave, hash, lines, visitId, visitStatus, activeRxId, upsert, updateRxById]);

  const statusText =
    state === 'saving'
      ? 'Saving…'
      : state === 'saved'
        ? 'Saved'
        : state === 'error'
          ? 'Save failed'
          : '';

  const showStartRevision = visitStatus === 'DONE';

  // ---------------------------
  // ✅ Print helper (Doctor panel parity with Reception)
  // ---------------------------
  const canPrint = lines.length > 0;

  const printPrescription = () => {
    if (!canPrint) return;

    const onAfterPrint = () => {
      document.body.classList.remove('print-rx');
      window.removeEventListener('afterprint', onAfterPrint);
    };

    window.addEventListener('afterprint', onAfterPrint);

    // enable Rx print isolation rules inside PrescriptionPrintSheet
    document.body.classList.add('print-rx');

    // allow DOM/styles to settle before invoking print (avoids Chrome capturing app shell)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  };

  // ---------------------------
  // Visits section
  // ---------------------------
  const visitsQuery = useGetPatientVisitsQuery(patientId ?? '', { skip: !patientId });
  const allVisitsRaw = visitsQuery.data?.items ?? [];

  const allVisits = useMemo(() => {
    const items = [...allVisitsRaw]
      .filter((v) => v.status === 'DONE') // ✅ ONLY DONE visits
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0));

    return items;
  }, [allVisitsRaw]);

  const [datePickerOpenMain, setDatePickerOpenMain] = useState(false);
  const [datePickerOpenDialog, setDatePickerOpenDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const selectedDateStr = useMemo(
    () => (selectedDate ? toISODate(selectedDate) : null),
    [selectedDate],
  );

  const filteredVisits = useMemo(() => {
    if (!selectedDateStr) return allVisits;
    return allVisits.filter((v) => v.visitDate === selectedDateStr);
  }, [allVisits, selectedDateStr]);

  // bottom list pagination (2 per page)
  const PAGE_SIZE = 2;
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [selectedDateStr]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredVisits.slice(start, start + PAGE_SIZE);
  }, [filteredVisits, page]);

  // View all dialog pagination (10 per page)
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const VIEW_ALL_PAGE_SIZE = 10;
  const [viewAllPage, setViewAllPage] = useState(1);

  useEffect(() => {
    if (viewAllOpen) setViewAllPage(1);
  }, [selectedDateStr, viewAllOpen]);

  const viewAllItems = useMemo(() => {
    const start = (viewAllPage - 1) * VIEW_ALL_PAGE_SIZE;
    return filteredVisits.slice(start, start + VIEW_ALL_PAGE_SIZE);
  }, [filteredVisits, viewAllPage]);

  const dateLabel = selectedDateStr ?? 'Pick a date';

  const openVisit = (v: Visit) => {
    router.push(`/doctor/visits/${v.visitId}`);
  };

  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-4 lg:grid-cols-10">
      <div className="min-w-0 rounded-2xl bg-white p-4 lg:col-span-4">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold text-gray-900">Prescription</div>
          <div className="flex items-center gap-2">
            <div className="text-[11px] text-gray-500">{statusText}</div>

            {showStartRevision ? (
              <Button
                variant="outline"
                className="rounded-xl"
                disabled={startRevisionState.isLoading}
                onClick={async () => {
                  try {
                    const res = await startRevision({ visitId }).unwrap();
                    setActiveRxId(res.rxId);
                    setState('idle');
                  } catch {
                    setState('error');
                  }
                }}
              >
                Start Revision
              </Button>
            ) : null}

            <Button
              variant="default"
              className="cursor-pointer rounded-xl"
              onClick={printPrescription}
              disabled={!canPrint}
              title={!canPrint ? 'No medicines to print' : 'Print prescription'}
            >
              Print
            </Button>
          </div>
        </div>

        <div className="mt-3 min-w-0 overflow-x-hidden">
          <PrescriptionPreview
            patientName={patientName}
            patientPhone={patientPhone}
            doctorName={doctorName}
            visitDateLabel={visitDateLabel}
            lines={lines}
          />
        </div>

        <PrescriptionPrintSheet
          patientName={patientName}
          patientPhone={patientPhone}
          doctorName={doctorName}
          visitDateLabel={visitDateLabel}
          lines={lines}
        />
      </div>

      <Card className="w-full min-w-0 rounded-2xl border bg-white p-4 lg:col-span-6">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="text-lg font-semibold text-gray-900">Medicines</div>

          <div className="flex items-center gap-2">
            <XrayUploader visitId={visitId} variant="outline" />
            <Button type="button" variant="outline" className="rounded-xl">
              Import Preset
            </Button>
          </div>
        </div>

        <div>
          <XrayGallery visitId={visitId} variant="embedded" />
        </div>

        <div className="min-w-0">
          <MedicinesEditor lines={lines} onChange={setLines} />
        </div>
      </Card>

      {/* Bottom Visits Section */}
      <Card className="lg:col-span-10 w-full rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <Popover open={datePickerOpenMain} onOpenChange={setDatePickerOpenMain}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="w-[220px] justify-start gap-2 rounded-xl"
              >
                <CalendarIcon className="h-4 w-4" />
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
                  setDatePickerOpenMain(false);
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
                      setDatePickerOpenMain(false);
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
            className="rounded-xl"
            onClick={() => setViewAllOpen(true)}
            disabled={!patientId}
          >
            View All
          </Button>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="font-semibold text-gray-600">Visit Date</TableHead>
                <TableHead className="font-semibold text-gray-600">Reason</TableHead>
                <TableHead className="font-semibold text-gray-600">Status</TableHead>
                <TableHead className="text-right font-semibold text-gray-600">Action</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {!patientId ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-gray-500">
                    Loading patient context…
                  </TableCell>
                </TableRow>
              ) : visitsQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-gray-500">
                    Loading visits…
                  </TableCell>
                </TableRow>
              ) : pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-gray-500">
                    No visits found{selectedDateStr ? ` for ${selectedDateStr}` : ''}.
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((v) => (
                  <TableRow key={v.visitId} className="hover:bg-gray-50/60">
                    <TableCell className="font-medium">{v.visitDate}</TableCell>
                    <TableCell className="text-gray-800">{v.reason ?? '—'}</TableCell>
                    <TableCell className="text-gray-800">{v.status ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 rounded-xl px-3 text-xs"
                        onClick={() => openVisit(v)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {filteredVisits.length > PAGE_SIZE ? (
            <div className="border-t bg-white px-3 py-2">
              <PaginationControl
                page={page}
                pageSize={PAGE_SIZE}
                totalItems={filteredVisits.length}
                onPageChange={setPage}
              />
            </div>
          ) : null}
        </div>

        {/* View All Dialog */}
        <Dialog open={viewAllOpen} onOpenChange={setViewAllOpen}>
          <DialogContent className="max-w-5xl rounded-2xl">
            <DialogHeader>
              <DialogTitle>All Visits</DialogTitle>
            </DialogHeader>

            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-600">
                {patientName ? (
                  <>
                    <span className="font-semibold text-gray-900">{patientName}</span>
                    {patientPhone ? (
                      <span className="ml-2 text-gray-500">({patientPhone})</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-gray-500">Patient</span>
                )}
              </div>

              <Popover open={datePickerOpenDialog} onOpenChange={setDatePickerOpenDialog}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-[220px] justify-start gap-2 rounded-xl"
                  >
                    <CalendarIcon className="h-4 w-4" />
                    <span className={selectedDateStr ? 'text-gray-900' : 'text-gray-500'}>
                      {dateLabel}
                    </span>
                  </Button>
                </PopoverTrigger>

                <PopoverContent align="end" className="w-auto rounded-2xl p-2">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => {
                      setSelectedDate(d);
                      setDatePickerOpenDialog(false);
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
                          setDatePickerOpenDialog(false);
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                  ) : null}
                </PopoverContent>
              </Popover>
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold text-gray-600">Visit Date</TableHead>
                    <TableHead className="font-semibold text-gray-600">Reason</TableHead>
                    <TableHead className="font-semibold text-gray-600">Status</TableHead>
                    <TableHead className="font-semibold text-gray-600">Doctor</TableHead>
                    <TableHead className="text-right font-semibold text-gray-600">Action</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {visitsQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-gray-500">
                        Loading visits…
                      </TableCell>
                    </TableRow>
                  ) : viewAllItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-gray-500">
                        No visits found{selectedDateStr ? ` for ${selectedDateStr}` : ''}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    viewAllItems.map((v) => (
                      <TableRow key={v.visitId} className="hover:bg-gray-50/60">
                        <TableCell className="font-medium">{v.visitDate}</TableCell>
                        <TableCell className="text-gray-800">{v.reason ?? '—'}</TableCell>
                        <TableCell className="text-gray-800">{v.status ?? '—'}</TableCell>
                        <TableCell className="text-gray-800">{v.doctorId ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-xl px-3 text-xs"
                            onClick={() => openVisit(v)}
                          >
                            Open
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {filteredVisits.length > VIEW_ALL_PAGE_SIZE ? (
                <div className="border-t bg-white px-3 py-2">
                  <PaginationControl
                    page={viewAllPage}
                    pageSize={VIEW_ALL_PAGE_SIZE}
                    totalItems={filteredVisits.length}
                    onPageChange={setViewAllPage}
                  />
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}
