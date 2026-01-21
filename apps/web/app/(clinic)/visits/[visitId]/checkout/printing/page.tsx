'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { XrayPrintSheet } from '@/components/xray/XrayPrintSheet';
import { BillPrintSheet } from '@/components/billing/BillPrintSheet';

import {
  useGetVisitByIdQuery,
  useGetPatientByIdQuery,
  useGetVisitRxQuery,
  useListVisitXraysQuery,
  useGetVisitBillQuery,
} from '@/src/store/api';
import { useAuth } from '@/src/hooks/useAuth';
import type { Billing } from '@dcm/types';

type PatientSex = 'M' | 'F' | 'O' | 'U';
type FollowUpContact = 'CALL' | 'SMS' | 'WHATSAPP' | 'OTHER';
type UnknownRecord = Record<string, unknown>;

function IconCheck(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LoadingOverlay({ show, label }: { show: boolean; label?: string }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-white px-6 py-5 shadow-sm">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        <div className="text-sm font-medium text-gray-900">{label ?? 'Loading…'}</div>
        <div className="text-xs text-gray-500">Please wait</div>
      </div>
    </div>
  );
}

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function getString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

function getNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function getBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

function getStrFromRecord(rec: UnknownRecord, key: string): string | undefined {
  return getString(rec[key]);
}

function getNumFromRecord(rec: UnknownRecord, key: string): number | undefined {
  return getNumber(rec[key]);
}

function getBoolFromRecordOpt(rec: UnknownRecord, key: string): boolean | undefined {
  return getBool(rec[key]);
}

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function safeParseDobToDate(dob: unknown): Date | null {
  if (!dob) return null;

  if (typeof dob === 'number' && Number.isFinite(dob)) {
    const d = new Date(dob);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  if (typeof dob === 'string') {
    const s = dob.trim();
    if (!s) return null;

    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const da = Number(m[3]);
      const d = new Date(y, mo, da);
      return Number.isFinite(d.getTime()) ? d : null;
    }

    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  if (dob instanceof Date) {
    return Number.isFinite(dob.getTime()) ? dob : null;
  }

  return null;
}

function calculateAge(dob: Date, at: Date): number {
  let age = at.getFullYear() - dob.getFullYear();
  const m = at.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) age -= 1;
  return age < 0 ? 0 : age;
}

function normalizeSex(raw: unknown): PatientSex | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim().toUpperCase();

  if (s === 'M' || s === 'MALE') return 'M';
  if (s === 'F' || s === 'FEMALE') return 'F';
  if (s === 'O' || s === 'OTHER') return 'O';
  if (s === 'U' || s === 'UNKNOWN') return 'U';

  if (s === 'M' || s === 'F' || s === 'O' || s === 'U') return s as PatientSex;

  return undefined;
}

function parseFollowUpContact(v: string): FollowUpContact {
  if (v === 'CALL' || v === 'SMS' || v === 'WHATSAPP' || v === 'OTHER') return v;
  return 'CALL';
}

function isoToDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const da = Number(m[3]);
  const d = new Date(y, mo, da);
  return Number.isFinite(d.getTime()) ? d : null;
}

type PrintAction = 'RX' | 'XRAY' | 'BILL' | null;

export default function VisitCheckoutPrintingPage() {
  const params = useParams<{ visitId: string }>();
  const router = useRouter();
  const auth = useAuth();

  const visitId = String(params?.visitId ?? '');
  const role = auth.status === 'authenticated' ? auth.role : undefined;
  const isAdmin = role === 'ADMIN';

  const visitQuery = useGetVisitByIdQuery(visitId, { skip: !visitId });
  const visit: unknown = visitQuery.data;
  const visitRec: UnknownRecord = isRecord(visit) ? visit : {};

  const patientId = getStrFromRecord(visitRec, 'patientId');
  const patientQuery = useGetPatientByIdQuery(patientId ?? '', { skip: !patientId });

  // We still fetch these (existing behavior), but we won't mount print sheets unless user opens them.
  const rxQuery = useGetVisitRxQuery({ visitId }, { skip: !visitId });
  const rx = rxQuery.data?.rx ?? null;

  const xraysQuery = useListVisitXraysQuery({ visitId }, { skip: !visitId });
  const xrayIds = (xraysQuery.data?.items ?? []).map((x) => x.xrayId);

  const billExists =
    !!visit &&
    (getBoolFromRecordOpt(visitRec, 'checkedOut') === true ||
      getNumFromRecord(visitRec, 'billingAmount') !== undefined);

  const shouldFetchBill = !!visitId && !!visit && billExists;
  const billQuery = useGetVisitBillQuery({ visitId }, { skip: !shouldFetchBill });
  const billData: unknown = billQuery.data ?? null;

  const billingForPrint: Billing | null =
    isRecord(billData) && getStrFromRecord(billData, 'billNo') ? (billData as Billing) : null;

  const [xrayPrintOpen, setXrayPrintOpen] = React.useState(false);
  const [billPrintOpen, setBillPrintOpen] = React.useState(false);
  const [doneSuccess, setDoneSuccess] = React.useState(false);

  const patientName = patientQuery.data?.name;
  const patientPhone = patientQuery.data?.phone;

  const patientRec: UnknownRecord = isRecord(patientQuery.data)
    ? (patientQuery.data as UnknownRecord)
    : {};

  const patientSdId =
    getStrFromRecord(patientRec, 'sdId') ?? getStrFromRecord(visitRec, 'sdId') ?? undefined;

  const opdNo =
    getStrFromRecord(visitRec, 'opdNo') ??
    getStrFromRecord(visitRec, 'opdId') ??
    getStrFromRecord(visitRec, 'opdNumber') ??
    undefined;

  const patientDobRaw =
    patientRec.dob ?? patientRec.dateOfBirth ?? patientRec.birthDate ?? patientRec.dobIso ?? null;

  const patientSexRaw = patientRec.sex ?? patientRec.gender ?? patientRec.patientSex ?? null;

  const patientDob = safeParseDobToDate(patientDobRaw);

  const visitCreatedAtMs = getNumFromRecord(visitRec, 'createdAt') ?? Date.now();
  const patientAge = patientDob ? calculateAge(patientDob, new Date(visitCreatedAtMs)) : undefined;
  const patientSex = normalizeSex(patientSexRaw);

  const visitCreatedDateLabel = visitCreatedAtMs
    ? `Visit: ${toLocalISODate(new Date(visitCreatedAtMs))}`
    : undefined;

  const visitDateLabel = getStrFromRecord(visitRec, 'visitDate')
    ? `Visit: ${String(visitRec.visitDate)}`
    : undefined;

  const statusLabel = getStrFromRecord(visitRec, 'status') ?? '—';
  const checkedOut = getBoolFromRecordOpt(visitRec, 'checkedOut') === true;

  const rxAvailable = !!rx;
  const xraysAvailable = xrayIds.length > 0;
  const billAvailable = billExists && !!billingForPrint;

  const isRxFetching = rxQuery.isLoading || rxQuery.isFetching;
  const isXraysFetching = xraysQuery.isLoading || xraysQuery.isFetching;
  const isBillFetching = billQuery.isLoading || billQuery.isFetching;

  const anyTopLoading =
    visitQuery.isLoading ||
    visitQuery.isFetching ||
    patientQuery.isLoading ||
    patientQuery.isFetching;

  const onDone = () => {
    setDoneSuccess(true);
    window.setTimeout(() => {
      router.replace('/');
    }, 850);
  };

  const [followUpEnabled, setFollowUpEnabled] = React.useState(false);

  const [followUpDate, setFollowUpDate] = React.useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return toLocalISODate(d);
  });
  const [followUpCalendarOpen, setFollowUpCalendarOpen] = React.useState(false);

  const followUpDateObj = React.useMemo(
    () => isoToDate(followUpDate) ?? new Date(),
    [followUpDate],
  );

  const [followUpContact, setFollowUpContact] = React.useState<FollowUpContact>('CALL');
  const [followUpReason, setFollowUpReason] = React.useState('');

  const goToFollowups = (mode: 'add' | 'list') => {
    if (!visitId) return;

    const qs = new URLSearchParams();
    qs.set('visitId', visitId);
    qs.set('mode', mode);

    if (followUpEnabled) qs.set('enabled', '1');
    if (followUpDate) qs.set('date', followUpDate);
    if (followUpContact) qs.set('contact', followUpContact);
    if (followUpReason.trim()) qs.set('reason', followUpReason.trim());

    router.push(`/reminders?${qs.toString()}`);
  };

  const ageSexLabel = patientAge !== undefined ? `${patientAge} / ${patientSex ?? '—'}` : '—';

  // -------- Loading overlay + deferred action --------
  const [pendingAction, setPendingAction] = React.useState<PrintAction>(null);
  const [overlayLabel, setOverlayLabel] = React.useState<string>('Loading…');

  const overlayOpen = pendingAction !== null;

  const startAction = (action: Exclude<PrintAction, null>) => {
    setPendingAction(action);
    if (action === 'RX') setOverlayLabel('Preparing prescription…');
    if (action === 'XRAY') setOverlayLabel('Preparing X-rays…');
    if (action === 'BILL') setOverlayLabel('Preparing bill…');
  };

  const clearAction = () => {
    setPendingAction(null);
    setOverlayLabel('Loading…');
  };

  React.useEffect(() => {
    if (!pendingAction) return;

    if (pendingAction === 'RX') {
      if (isRxFetching) return;
      if (!rxAvailable) {
        clearAction();
        toast.info('No prescription available for this visit.');
        return;
      }
      router.push(`/visits/${visitId}/checkout/printing/prescription`);
      return;
    }

    if (pendingAction === 'XRAY') {
      if (isXraysFetching) return;
      if (!xraysAvailable) {
        clearAction();
        toast.info('No X-rays uploaded for this visit.');
        return;
      }
      setXrayPrintOpen(true);
      window.setTimeout(() => clearAction(), 0);
      return;
    }

    if (pendingAction === 'BILL') {
      if (isBillFetching) return;
      if (!billAvailable) {
        clearAction();
        toast.info('No bill found for this visit.');
        return;
      }
      setBillPrintOpen(true);
      window.setTimeout(() => clearAction(), 0);
    }
  }, [
    pendingAction,
    isRxFetching,
    isXraysFetching,
    isBillFetching,
    rxAvailable,
    xraysAvailable,
    billAvailable,
    router,
    visitId,
  ]);

  // ✅ Correctly disable buttons when "Not Available"
  const rxDisabled = !visitId || (!rxAvailable && !isRxFetching);
  const xrayDisabled = !visitId || (!xraysAvailable && !isXraysFetching); // <-- FIXED
  const billDisabled = !visitId || (billExists ? !billAvailable && !isBillFetching : true);

  return (
    <section className="p-4 2xl:p-8">
      <LoadingOverlay show={overlayOpen} label={overlayLabel} />

      <style jsx global>{`
        @keyframes pulseRing {
          0% {
            transform: scale(0.75);
            opacity: 0.9;
          }
          100% {
            transform: scale(1.35);
            opacity: 0;
          }
        }
      `}</style>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-lg font-semibold text-gray-900">Documents</div>
          <div className="text-xs text-gray-500">{statusLabel}</div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {isAdmin ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl cursor-pointer"
                onClick={() => router.back()}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl cursor-pointer"
                onClick={() => router.push(`/visits/${visitId}/checkout/billing`)}
              >
                Billing
              </Button>
            </>
          ) : null}

          <Button
            type="button"
            variant="default"
            className="rounded-xl bg-black text-white hover:bg-black/90 cursor-pointer"
            onClick={onDone}
            disabled={doneSuccess}
          >
            {doneSuccess ? (
              <span className="inline-flex items-center gap-2">
                <span className="relative inline-flex h-5 w-5 items-center justify-center">
                  <span className="absolute inset-0 rounded-full ring-2 ring-emerald-300 animate-[pulseRing_800ms_ease-out]" />
                  <IconCheck className="h-5 w-5 text-emerald-300" />
                </span>
                Done
              </span>
            ) : (
              'Done'
            )}
          </Button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-gray-500">Patient</div>
          <div className="mt-1 text-base font-semibold text-gray-900">
            {anyTopLoading && !patientName ? 'Loading…' : (patientName ?? '—')}
          </div>
          <div className="mt-1 text-sm text-gray-600">
            {anyTopLoading && !patientPhone ? '—' : (patientPhone ?? '—')}
          </div>
        </Card>

        <Card className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-gray-500">Visit summary</div>

          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <div className="text-gray-500">Visit date</div>
            <div className="text-right font-medium text-gray-900">
              {visitDateLabel?.replace('Visit:', '').trim() ||
                visitCreatedDateLabel?.replace('Visit:', '').trim() ||
                '—'}
            </div>

            <div className="text-gray-500">SD ID</div>
            <div className="text-right font-medium text-gray-900">{patientSdId ?? '—'}</div>

            <div className="text-gray-500">OPD No</div>
            <div className="text-right font-medium text-gray-900">{opdNo ?? '—'}</div>

            <div className="text-gray-500">Age / Sex</div>
            <div className="text-right font-medium text-gray-900">{ageSexLabel}</div>

            <div className="text-gray-500">Checked out</div>
            <div className="text-right font-medium text-gray-900">{checkedOut ? 'Yes' : 'No'}</div>
          </div>
        </Card>

        <Card className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-gray-500">Print readiness</div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Prescription</span>
              <span
                className={
                  rxAvailable
                    ? 'text-emerald-700 font-semibold'
                    : isRxFetching
                      ? 'text-gray-700'
                      : 'text-gray-400'
                }
              >
                {rxAvailable ? 'Ready' : isRxFetching ? 'Loading…' : 'Not Available'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-700">X-rays</span>
              <span
                className={
                  xraysAvailable
                    ? 'text-emerald-700 font-semibold'
                    : isXraysFetching
                      ? 'text-gray-700'
                      : 'text-gray-400'
                }
              >
                {xraysAvailable ? 'Ready' : isXraysFetching ? 'Loading…' : 'Not Available'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-700">Bill</span>
              <span
                className={
                  billAvailable
                    ? 'text-emerald-700 font-semibold'
                    : billExists && isBillFetching
                      ? 'text-gray-700'
                      : 'text-gray-400'
                }
              >
                {billAvailable
                  ? 'Ready'
                  : billExists && isBillFetching
                    ? 'Loading…'
                    : 'Not Available'}
              </span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7 rounded-2xl border bg-white p-6">
          <div>
            <div className="text-lg font-semibold text-gray-900">Print</div>
            <div className="text-xs text-gray-500">Documents are ready to print.</div>
          </div>

          <div className="mt-6 flex flex-col items-center justify-center gap-3 py-8">
            <Button
              type="button"
              variant="outline"
              className="w-full max-w-sm rounded-2xl py-6 text-base cursor-pointer"
              onClick={() => startAction('RX')}
              disabled={rxDisabled}
              title={
                rxDisabled
                  ? isRxFetching
                    ? 'Preparing…'
                    : 'No prescription available'
                  : 'Open print preview'
              }
            >
              {pendingAction === 'RX' || isRxFetching ? 'Preparing…' : 'Print Prescription'}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full max-w-sm rounded-2xl py-6 text-base cursor-pointer"
              onClick={() => startAction('XRAY')}
              disabled={xrayDisabled}
              title={
                xrayDisabled
                  ? isXraysFetching
                    ? 'Preparing…'
                    : 'No X-rays uploaded'
                  : 'Print X-rays'
              }
            >
              {pendingAction === 'XRAY' || isXraysFetching ? 'Preparing…' : 'Print X-rays'}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full max-w-sm rounded-2xl py-6 text-base cursor-pointer"
              onClick={() => startAction('BILL')}
              disabled={billDisabled}
              title={
                billDisabled
                  ? billExists && isBillFetching
                    ? 'Preparing…'
                    : 'No bill found'
                  : 'Print bill'
              }
            >
              {pendingAction === 'BILL' || isBillFetching ? 'Preparing…' : 'Print Bill'}
            </Button>
          </div>
        </Card>

        <Card className="lg:col-span-5 rounded-2xl border bg-white p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-gray-900">Follow-up</div>
              <div className="text-xs text-gray-500">Add follow-up for this visit.</div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="rounded-xl cursor-pointer"
              onClick={() => setFollowUpEnabled((v) => !v)}
            >
              {followUpEnabled ? 'Disable' : 'Enable'}
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {followUpEnabled ? (
              <div className="rounded-2xl border bg-gray-50 p-4">
                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-700">Follow-up date</div>

                    <Popover open={followUpCalendarOpen} onOpenChange={setFollowUpCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-1 h-10 w-full justify-start rounded-xl bg-white px-3 text-sm font-normal cursor-pointer"
                        >
                          {followUpDate ? followUpDate : 'Select a date'}
                        </Button>
                      </PopoverTrigger>

                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={followUpDateObj}
                          onSelect={(d) => {
                            if (!d) return;
                            setFollowUpDate(toLocalISODate(d));
                            setFollowUpCalendarOpen(false);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-gray-700">Contact method</div>
                    <select
                      className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm cursor-pointer"
                      value={followUpContact}
                      onChange={(e) => setFollowUpContact(parseFollowUpContact(e.target.value))}
                    >
                      <option value="CALL" className="cursor-pointer">
                        CALL
                      </option>
                      <option value="SMS" className="cursor-pointer">
                        SMS
                      </option>
                      <option value="WHATSAPP" className="cursor-pointer">
                        WHATSAPP
                      </option>
                      <option value="OTHER" className="cursor-pointer">
                        OTHER
                      </option>
                    </select>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-gray-700">Reason / notes</div>
                    <Textarea
                      className="mt-1 min-h-22.5 rounded-xl bg-white"
                      placeholder="e.g., stitch removal / review pain / follow-up check"
                      value={followUpReason}
                      onChange={(e) => setFollowUpReason(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      className="w-full rounded-2xl bg-black py-5 text-white hover:bg-black/90 cursor-pointer"
                      onClick={() => {
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(followUpDate)) {
                          toast.error('Follow-up date must be YYYY-MM-DD.');
                          return;
                        }
                        goToFollowups('add');
                      }}
                    >
                      Add Follow-up
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full rounded-2xl py-5 cursor-pointer"
                      onClick={() => goToFollowups('list')}
                    >
                      View Follow-ups
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-4 text-sm texttext-gray-600">
                Follow-up is disabled.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ✅ IMPORTANT FIX:
          Do NOT mount print sheets unless user is printing.
          This prevents "extra window.print()" / extra print dialogs. */}
      {xrayPrintOpen && (
        <XrayPrintSheet
          open={xrayPrintOpen}
          xrayIds={xrayIds}
          onAfterPrint={() => setXrayPrintOpen(false)}
        />
      )}

      {billPrintOpen && (
        <BillPrintSheet
          open={billPrintOpen}
          billing={billingForPrint}
          patientName={patientName}
          patientPhone={patientPhone}
          ageSexLabel={ageSexLabel}
          opdNo={opdNo}
          sdId={patientSdId}
          visitDateLabel={visitDateLabel}
          onAfterPrint={() => setBillPrintOpen(false)}
        />
      )}
    </section>
  );
}
