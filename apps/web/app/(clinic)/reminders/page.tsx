'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';
import {
  Calendar as CalendarIcon,
  PhoneCall,
  Copy,
  CheckCircle2,
  XCircle,
  ArrowLeft,
} from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

import { useAuth } from '@/src/hooks/useAuth';
import {
  useCreateVisitFollowupMutation,
  useGetDailyFollowupsQuery,
  useUpdateFollowupStatusMutation,
} from '@/src/store/api';
import { clinicDateISO } from '@/src/lib/clinicTime';

type ApiError = {
  status?: number;
  data?: any;
};

type FollowupStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

/**
 * ✅ IMPORTANT: Use LOCAL YYYY-MM-DD (NOT toISOString)
 * toISOString() converts to UTC and causes off-by-one in IST.
 */

function parseISODateToLocalDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map((x) => Number(x));
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function safeCopy(text: string) {
  void navigator.clipboard
    .writeText(text)
    .then(() => toast.success('Copied'))
    .catch(() => toast.error('Copy failed'));
}

function prettyMethod(m?: string) {
  if (!m) return '—';
  if (m === 'CALL') return 'Call';
  if (m === 'SMS') return 'SMS';
  if (m === 'WHATSAPP') return 'WhatsApp';
  return m;
}

function isAllowedContactMethod(x: string | null): x is 'CALL' | 'SMS' | 'WHATSAPP' {
  return x === 'CALL' || x === 'SMS' || x === 'WHATSAPP';
}

function StatusPill({ status }: { status: FollowupStatus | string }) {
  if (status === 'COMPLETED') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
        Done
      </span>
    );
  }
  if (status === 'CANCELLED') {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
        Cancelled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      Active
    </span>
  );
}

export default function RemindersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const selectedDateStr = useMemo(() => clinicDateISO(selectedDate), [selectedDate]);

  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const followupsQuery = useGetDailyFollowupsQuery(selectedDateStr, {
    skip: !canUseApi,
  });

  /**
   * ✅ Local overlay so items don't disappear after marking done/cancel.
   * - Keeps UI stable even if RTK mutation optimistically removes.
   * - NOTE: To persist across refresh, backend must return non-ACTIVE too.
   */
  const [localStatusById, setLocalStatusById] = useState<Record<string, FollowupStatus>>({});
  const [localOrder, setLocalOrder] = useState<string[]>([]);
  const [localItemsById, setLocalItemsById] = useState<Record<string, any>>({});

  // Merge fetched items into local store (so we can keep them visible)
  useEffect(() => {
    const fetched = followupsQuery.data?.items ?? [];
    if (fetched.length === 0) return;

    setLocalItemsById((prev) => {
      const next = { ...prev };
      for (const it of fetched) next[it.followupId] = it;
      return next;
    });

    setLocalOrder((prev) => {
      const seen = new Set(prev);
      const next = [...prev];
      for (const it of fetched) {
        if (!seen.has(it.followupId)) {
          next.push(it.followupId);
          seen.add(it.followupId);
        }
      }
      return next;
    });
  }, [followupsQuery.data?.items]);

  // Current visible list for the selected date
  const items = useMemo(() => {
    const fetched = followupsQuery.data?.items ?? [];
    const fetchedIds = new Set(fetched.map((x) => x.followupId));

    // Start with fetched items
    const base = [...fetched];

    // Add locally-kept items that were previously fetched but disappeared due to status change
    for (const id of localOrder) {
      if (fetchedIds.has(id)) continue;
      const it = localItemsById[id];
      if (!it) continue;
      if (it.followUpDate !== selectedDateStr) continue;
      base.push(it);
    }

    // Apply local status override
    return base.map((it: any) => {
      const local = localStatusById[it.followupId];
      return local ? { ...it, status: local } : it;
    });
  }, [followupsQuery.data?.items, localOrder, localItemsById, localStatusById, selectedDateStr]);

  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  const [updateStatus, updateStatusState] = useUpdateFollowupStatusMutation();
  const [createFollowup, createFollowupState] = useCreateVisitFollowupMutation();

  /**
   * ✅ Auto-create flow (arrives from printing page)
   * /reminders?mode=add&visitId=...&date=YYYY-MM-DD&contact=CALL&reason=...
   *
   * Run once, then clean URL.
   */
  const autoCreateRan = useRef(false);

  useEffect(() => {
    if (!canUseApi) return;
    if (autoCreateRan.current) return;

    const mode = searchParams.get('mode');
    const visitId = searchParams.get('visitId');
    const date = searchParams.get('date');
    const contact = searchParams.get('contact');
    const reason = searchParams.get('reason');

    if (mode !== 'add') return;
    if (!visitId || !date) return;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error('Invalid follow-up date in URL.');
      return;
    }

    const parsed = parseISODateToLocalDate(date);
    if (parsed) setSelectedDate(parsed);

    autoCreateRan.current = true;

    const contactMethod: 'CALL' | 'SMS' | 'WHATSAPP' | undefined = isAllowedContactMethod(contact)
      ? contact
      : undefined;

    void (async () => {
      try {
        const created = await createFollowup({
          visitId,
          followUpDate: date,
          reason: reason?.trim() || undefined,
          contactMethod,
        }).unwrap();

        toast.success('Follow-up added');

        // Ensure it appears immediately in local store even before refetch
        setLocalItemsById((prev) => ({ ...prev, [created.followupId]: created }));
        setLocalOrder((prev) =>
          prev.includes(created.followupId) ? prev : [...prev, created.followupId],
        );

        // Clean URL
        const next = new URLSearchParams(searchParams.toString());
        next.delete('mode');
        next.delete('visitId');
        next.delete('date');
        next.delete('contact');
        next.delete('reason');
        next.delete('enabled');

        const qs = next.toString();
        router.replace(qs ? `/reminders?${qs}` : '/reminders');
      } catch (e: any) {
        toast.error(e?.data?.message ?? e?.message ?? 'Failed to add follow-up');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseApi, searchParams, createFollowup, router]);

  const markCompleted = async (visitId: string, followupId: string) => {
    if (!canUseApi) {
      toast.error('Session not ready. Please re-login.');
      return;
    }

    // Optimistic UI: keep row + show Done badge immediately
    setLocalStatusById((prev) => ({ ...prev, [followupId]: 'COMPLETED' }));

    try {
      await updateStatus({
        visitId,
        followupId,
        status: 'COMPLETED',
        dateTag: selectedDateStr,
      }).unwrap();
      toast.success('Marked as completed');
    } catch (e: any) {
      // rollback
      setLocalStatusById((prev) => {
        const next = { ...prev };
        delete next[followupId];
        return next;
      });
      toast.error(e?.data?.message ?? e?.message ?? 'Failed to update');
    }
  };

  const markCancelled = async (visitId: string, followupId: string) => {
    if (!canUseApi) {
      toast.error('Session not ready. Please re-login.');
      return;
    }

    // Optimistic UI: keep row + show Cancelled badge immediately
    setLocalStatusById((prev) => ({ ...prev, [followupId]: 'CANCELLED' }));

    try {
      await updateStatus({
        visitId,
        followupId,
        status: 'CANCELLED',
        dateTag: selectedDateStr,
      }).unwrap();
      toast.success('Cancelled');
    } catch (e: any) {
      // rollback
      setLocalStatusById((prev) => {
        const next = { ...prev };
        delete next[followupId];
        return next;
      });
      toast.error(e?.data?.message ?? e?.message ?? 'Failed to update');
    }
  };

  const headerLabel = expanded
    ? `WBC / Reminder Calls — ${selectedDateStr}`
    : 'WBC / Reminder Calls';

  const errorMessage = (() => {
    if (!followupsQuery.isError) return null;
    const e = followupsQuery.error as ApiError | undefined;
    if (e?.status === 401) return 'Not authorized. Please login again.';
    return 'Failed to load reminders.';
  })();

  return (
    <div className="relative p-4 2xl:p-8">
      <div
        className={[
          'pointer-events-none fixed inset-0 z-20 bg-black/20 opacity-0 transition-opacity duration-300',
          expanded ? 'pointer-events-auto opacity-100' : '',
        ].join(' ')}
        onClick={() => setExpanded(false)}
        aria-hidden
      />

      <div
        className={[
          'relative z-30 transition-all duration-300 ease-in-out',
          expanded ? 'fixed left-[calc(280px+24px)] right-6 top-20 bottom-6' : '',
        ].join(' ')}
      >
        <Card
          className={[
            'h-full w-full rounded-2xl border bg-white p-4 transition-all duration-300 ease-in-out',
            expanded ? 'shadow-2xl' : 'shadow-none',
          ].join(' ')}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div className="flex items-center gap-3">
              {expanded && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 rounded-xl px-2"
                  onClick={() => setExpanded(false)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}

              <div>
                <div className="text-lg font-semibold text-gray-900">{headerLabel}</div>
                <div className="text-xs text-gray-500">
                  {!canUseApi
                    ? 'Checking session…'
                    : createFollowupState.isLoading
                      ? 'Adding follow-up…'
                      : followupsQuery.isFetching
                        ? 'Refreshing…'
                        : `${items.length} reminder(s)`}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-[220px] justify-start gap-2 rounded-xl"
                    disabled={!canUseApi}
                  >
                    <CalendarIcon className="h-4 w-4" />
                    <span className="text-gray-900">{selectedDateStr}</span>
                  </Button>
                </PopoverTrigger>

                <PopoverContent align="end" className="w-auto rounded-2xl p-2">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => {
                      if (!d) return;
                      setSelectedDate(d);
                      setDatePickerOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>

              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? 'View Less' : 'View All'}
              </Button>
            </div>
          </div>

          <div className="mt-4 h-[calc(100%-64px)] overflow-hidden rounded-2xl border">
            <div className="h-full overflow-y-auto dms-scroll bg-white">
              {errorMessage && (
                <div className="border-b bg-red-50 px-4 py-2 text-sm text-red-700">
                  {errorMessage}
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead>Patient</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Follow-up Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-gray-500">
                        No reminders for {selectedDateStr}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((it: any) => {
                      const status: FollowupStatus = (it.status as FollowupStatus) || 'ACTIVE';
                      const isActive = status === 'ACTIVE';

                      return (
                        <TableRow key={it.followupId} className={!isActive ? 'opacity-80' : ''}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{it.patientName}</span>
                              <span className="text-[10px] text-gray-500">
                                Patient ID: {it.patientId}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            {it.patientPhone ? (
                              <div className="flex items-center gap-2">
                                <span>{it.patientPhone}</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => safeCopy(it.patientPhone!)}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              '—'
                            )}
                          </TableCell>

                          <TableCell>{it.reason ?? '—'}</TableCell>
                          <TableCell>{it.followUpDate}</TableCell>
                          <TableCell>{prettyMethod(it.contactMethod)}</TableCell>

                          <TableCell>
                            <StatusPill status={status} />
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {it.patientPhone && (
                                <a href={`tel:${it.patientPhone}`}>
                                  <Button variant="outline" size="sm">
                                    <PhoneCall className="mr-2 h-4 w-4" />
                                    Call
                                  </Button>
                                </a>
                              )}

                              <Link href={`/patients/${it.patientId}`}>
                                <Button variant="outline" size="sm">
                                  Open
                                </Button>
                              </Link>

                              <Button
                                size="sm"
                                onClick={() => void markCompleted(it.visitId, it.followupId)}
                                disabled={!isActive || updateStatusState.isLoading}
                                title={!isActive ? 'Already resolved' : 'Mark as done'}
                              >
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Done
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void markCancelled(it.visitId, it.followupId)}
                                disabled={!isActive || updateStatusState.isLoading}
                                title={!isActive ? 'Already resolved' : 'Cancel'}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancel
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
