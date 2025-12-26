'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
import { useGetDailyFollowupsQuery, useUpdateFollowupStatusMutation } from '@/src/store/api';

type ApiError = {
  status?: number;
  data?: any;
};

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
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

export default function RemindersPage() {
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const selectedDateStr = useMemo(() => toISODate(selectedDate), [selectedDate]);

  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // ✅ IMPORTANT: skip until we actually have a valid session token
  const followupsQuery = useGetDailyFollowupsQuery(selectedDateStr, {
    skip: !canUseApi,
  });

  const items = followupsQuery.data?.items ?? [];

  // Expand/collapse (animated grow)
  const [expanded, setExpanded] = useState(false);

  // Prevent background scroll when expanded
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  const [updateStatus, updateStatusState] = useUpdateFollowupStatusMutation();

  const markCompleted = async (visitId: string) => {
    if (!canUseApi) {
      toast.error('Session not ready. Please re-login.');
      return;
    }

    try {
      await updateStatus({ visitId, status: 'COMPLETED', dateTag: selectedDateStr }).unwrap();
      toast.success('Marked as completed');
    } catch (e: any) {
      toast.error(e?.data?.message ?? e?.message ?? 'Failed to update');
    }
  };

  const markCancelled = async (visitId: string) => {
    if (!canUseApi) {
      toast.error('Session not ready. Please re-login.');
      return;
    }

    try {
      await updateStatus({ visitId, status: 'CANCELLED', dateTag: selectedDateStr }).unwrap();
      toast.success('Cancelled');
    } catch (e: any) {
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

  const showLoadingState =
    !canUseApi ||
    auth.status === 'checking' ||
    followupsQuery.isLoading ||
    followupsQuery.isFetching;

  return (
    <div className="relative p-4 2xl:p-8">
      {/* Backdrop when expanded */}
      <div
        className={[
          'pointer-events-none fixed inset-0 z-20 bg-black/20 opacity-0 transition-opacity duration-300',
          expanded ? 'pointer-events-auto opacity-100' : '',
        ].join(' ')}
        onClick={() => setExpanded(false)}
        aria-hidden
      />

      {/* Container that can "grow" */}
      <div
        className={[
          'relative z-30 transition-all duration-300 ease-in-out',
          expanded ? 'fixed left-[calc(280px+24px)] right-6 top-[calc(24px+56px)] bottom-6' : '',
        ].join(' ')}
      >
        <Card
          className={[
            'h-full w-full rounded-2xl border bg-white p-4 transition-all duration-300 ease-in-out',
            expanded ? 'shadow-2xl' : 'shadow-none',
          ].join(' ')}
        >
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div className="flex items-center gap-3">
              {expanded ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 rounded-xl px-2"
                  onClick={() => setExpanded(false)}
                  title="View less"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              ) : null}

              <div>
                <div className="text-lg font-semibold text-gray-900">{headerLabel}</div>
                <div className="text-xs text-gray-500">
                  {!canUseApi
                    ? 'Checking session…'
                    : followupsQuery.isFetching
                      ? 'Refreshing…'
                      : `${items.length} active reminder(s)`}
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
                    disabled={!canUseApi && auth.status !== 'authenticated'}
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
                  <div className="px-2 pb-2 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 rounded-xl text-xs"
                      onClick={() => {
                        setSelectedDate(new Date());
                        setDatePickerOpen(false);
                      }}
                    >
                      Today
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              {!expanded ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setExpanded(true)}
                >
                  View All
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setExpanded(false)}
                >
                  View Less
                </Button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="mt-4 h-[calc(100%-64px)] overflow-hidden rounded-2xl border">
            <div className="h-full overflow-y-auto dms-scroll bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold text-gray-600">Patient</TableHead>
                    <TableHead className="font-semibold text-gray-600">Phone</TableHead>
                    <TableHead className="font-semibold text-gray-600">Reason</TableHead>
                    <TableHead className="font-semibold text-gray-600">Follow-up Date</TableHead>
                    <TableHead className="font-semibold text-gray-600">Method</TableHead>
                    <TableHead className="text-right font-semibold text-gray-600">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {!canUseApi ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-gray-500">
                        Checking session…
                      </TableCell>
                    </TableRow>
                  ) : followupsQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-gray-500">
                        Loading reminders…
                      </TableCell>
                    </TableRow>
                  ) : followupsQuery.isError ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-red-600">
                        {errorMessage}
                      </TableCell>
                    </TableRow>
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-gray-500">
                        No active reminders for {selectedDateStr}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((it) => {
                      const phone = it.patientPhone ?? '';
                      const callHref = phone ? `tel:${phone}` : undefined;

                      return (
                        <TableRow key={it.visitId} className="hover:bg-gray-50/60">
                          <TableCell className="font-medium text-gray-900">
                            <div className="flex flex-col">
                              <span>{it.patientName}</span>
                              <span className="text-[10px] text-gray-500">
                                Patient ID: {it.patientId}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell className="text-gray-800">
                            {phone ? (
                              <div className="flex items-center gap-2">
                                <span>{phone}</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-full hover:bg-gray-100"
                                  onClick={() => safeCopy(phone)}
                                  title="Copy phone"
                                >
                                  <Copy className="h-4 w-4 text-gray-600" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </TableCell>

                          <TableCell className="text-gray-800">{it.reason ?? '—'}</TableCell>
                          <TableCell className="text-gray-800">{it.followUpDate}</TableCell>
                          <TableCell className="text-gray-800">
                            {prettyMethod(it.contactMethod)}
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {callHref ? (
                                <a href={callHref}>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-8 rounded-xl px-3 text-xs"
                                    title="Call patient"
                                  >
                                    <PhoneCall className="mr-2 h-4 w-4" />
                                    Call
                                  </Button>
                                </a>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 rounded-xl px-3 text-xs"
                                  disabled
                                  title="No phone number"
                                >
                                  <PhoneCall className="mr-2 h-4 w-4" />
                                  Call
                                </Button>
                              )}

                              <Link href={`/patients/${it.patientId}`}>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 rounded-xl px-3 text-xs"
                                >
                                  Open
                                </Button>
                              </Link>

                              <Button
                                type="button"
                                className="h-8 rounded-xl bg-black px-3 text-xs text-white hover:bg-black/90"
                                disabled={updateStatusState.isLoading || !canUseApi}
                                onClick={() => void markCompleted(it.visitId)}
                                title="Mark reminder as completed"
                              >
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Done
                              </Button>

                              <Button
                                type="button"
                                variant="outline"
                                className="h-8 rounded-xl px-3 text-xs"
                                disabled={updateStatusState.isLoading || !canUseApi}
                                onClick={() => void markCancelled(it.visitId)}
                                title="Cancel reminder"
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

              <div className="h-4" />
            </div>
          </div>

          {!expanded ? (
            <div className="mt-3 text-xs text-gray-500">
              Tip: Click <span className="font-semibold text-gray-700">View All</span> to expand the
              table with a smooth animation.
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
