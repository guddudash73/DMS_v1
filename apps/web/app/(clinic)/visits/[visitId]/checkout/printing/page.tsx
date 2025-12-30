'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { PrescriptionPrintSheet } from '@/components/prescription/PrescriptionPrintSheet';
import { XrayPrintSheet } from '@/components/xray/XrayPrintSheet';
import { BillPrintSheet } from '@/components/billing/BillPrintSheet';

import {
  useGetVisitByIdQuery,
  useGetPatientByIdQuery,
  useGetVisitRxQuery,
  useListVisitXraysQuery,
  useGetVisitBillQuery,
  useGetDoctorsQuery,
} from '@/src/store/api';
import { useAuth } from '@/src/hooks/useAuth';

type PatientSex = 'M' | 'F' | 'O' | 'U';

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

function looksLikeDoctorIdLabel(name?: string) {
  if (!name) return true;
  const s = name.trim();
  if (!s) return true;

  if (/^Doctor\s*\(.+\)$/i.test(s)) return true;

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;

  return false;
}

export default function VisitCheckoutPrintingPage() {
  const params = useParams<{ visitId: string }>();
  const router = useRouter();
  const auth = useAuth();

  const visitId = String(params?.visitId ?? '');
  const role = auth.status === 'authenticated' ? auth.role : undefined;
  const isAdmin = role === 'ADMIN';

  const visitQuery = useGetVisitByIdQuery(visitId, { skip: !visitId });
  const visit = visitQuery.data;

  const patientId = visit?.patientId;
  const patientQuery = useGetPatientByIdQuery(patientId ?? '', { skip: !patientId });

  const rxQuery = useGetVisitRxQuery({ visitId }, { skip: !visitId });
  const rx = rxQuery.data?.rx ?? null;

  const xraysQuery = useListVisitXraysQuery({ visitId }, { skip: !visitId });
  const xrayIds = (xraysQuery.data?.items ?? []).map((x) => x.xrayId);

  const billQuery = useGetVisitBillQuery({ visitId }, { skip: !visitId });
  const bill = billQuery.data ?? null;

  const doctorsQuery = useGetDoctorsQuery(undefined);

  const [xrayPrintOpen, setXrayPrintOpen] = React.useState(false);
  const [billPrintOpen, setBillPrintOpen] = React.useState(false);
  const [doneSuccess, setDoneSuccess] = React.useState(false);

  const patientName = patientQuery.data?.name;
  const patientPhone = patientQuery.data?.phone;

  const patientSdId = (patientQuery.data as any)?.sdId ?? (visit as any)?.sdId ?? undefined;

  const opdNo =
    (visit as any)?.opdNo ?? (visit as any)?.opdId ?? (visit as any)?.opdNumber ?? undefined;

  const patientDobRaw =
    (patientQuery.data as any)?.dob ??
    (patientQuery.data as any)?.dateOfBirth ??
    (patientQuery.data as any)?.birthDate ??
    (patientQuery.data as any)?.dobIso ??
    null;

  const patientSexRaw =
    (patientQuery.data as any)?.sex ??
    (patientQuery.data as any)?.gender ??
    (patientQuery.data as any)?.patientSex ??
    null;

  const patientDob = safeParseDobToDate(patientDobRaw);

  const visitCreatedAtMs =
    typeof (visit as any)?.createdAt === 'number' ? (visit as any).createdAt : Date.now();

  const patientAge = patientDob ? calculateAge(patientDob, new Date(visitCreatedAtMs)) : undefined;
  const patientSex = normalizeSex(patientSexRaw);

  const doctorId = (visit as any)?.doctorId as string | undefined;

  const doctorFromList = React.useMemo(() => {
    const list = doctorsQuery.data ?? [];
    if (!doctorId) return null;
    return (list as any[]).find((d) => d.doctorId === doctorId) ?? null;
  }, [doctorsQuery.data, doctorId]);

  const doctorNameResolved =
    (doctorFromList as any)?.fullName ??
    (doctorFromList as any)?.name ??
    (doctorFromList as any)?.displayName ??
    undefined;

  const doctorRegNoResolved = (doctorFromList as any)?.registrationNumber ?? undefined;

  const resolvedDoctorName = React.useMemo(() => {
    if (doctorNameResolved && !looksLikeDoctorIdLabel(doctorNameResolved))
      return doctorNameResolved;

    if (doctorsQuery.isLoading || doctorsQuery.isFetching) return undefined;

    return doctorId ? `Doctor (${doctorId})` : undefined;
  }, [doctorNameResolved, doctorsQuery.isLoading, doctorsQuery.isFetching, doctorId]);

  const resolvedDoctorRegdLabel = React.useMemo(() => {
    if (doctorRegNoResolved) return `B.D.S Regd. - ${doctorRegNoResolved}`;

    if (doctorsQuery.isLoading || doctorsQuery.isFetching) return undefined;

    return undefined;
  }, [doctorRegNoResolved, doctorsQuery.isLoading, doctorsQuery.isFetching]);

  const doctorLabelForCards = resolvedDoctorName ?? (doctorId ? `Doctor (${doctorId})` : 'Doctor');

  const visitCreatedDateLabel = visitCreatedAtMs
    ? `Visit: ${toLocalISODate(new Date(visitCreatedAtMs))}`
    : undefined;

  const visitDateLabel = (visit as any)?.visitDate
    ? `Visit: ${(visit as any).visitDate}`
    : undefined;

  const printRx = () => {
    if (!rx) return;

    const onAfterPrint = () => {
      document.body.classList.remove('print-rx');
      window.removeEventListener('afterprint', onAfterPrint);
    };

    window.addEventListener('afterprint', onAfterPrint);
    document.body.classList.add('print-rx');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  const onDone = () => {
    setDoneSuccess(true);
    window.setTimeout(() => {
      router.replace('/');
    }, 850);
  };

  const rxAvailable = !!rx;
  const xraysAvailable = xrayIds.length > 0;
  const billAvailable = !!bill;

  const [followUpEnabled, setFollowUpEnabled] = React.useState(false);
  const [followUpDate, setFollowUpDate] = React.useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return toLocalISODate(d);
  });
  const [followUpContact, setFollowUpContact] = React.useState<
    'CALL' | 'SMS' | 'WHATSAPP' | 'OTHER'
  >('CALL');
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

  const RxSheetAny: any = PrescriptionPrintSheet;

  return (
    <section className="p-4 2xl:p-8">
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
          <div className="text-xs text-gray-500">
            Visit ID: {visitId} · Tag: {(visit as any)?.tag ?? '—'} · Status:{' '}
            {(visit as any)?.status ?? '—'}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {isAdmin ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => router.back()}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => router.push(`/visits/${visitId}/checkout/billing`)}
              >
                Billing
              </Button>
            </>
          ) : null}

          <Button
            type="button"
            variant="default"
            className="rounded-xl bg-black text-white hover:bg-black/90"
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
          <div className="mt-1 text-base font-semibold text-gray-900">{patientName ?? '—'}</div>
          <div className="mt-1 text-sm text-gray-600">{patientPhone ?? '—'}</div>
        </Card>

        <Card className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-gray-500">Doctor</div>
          <div className="mt-1 text-base font-semibold text-gray-900">
            {doctorLabelForCards ?? '—'}
          </div>
          <div className="mt-1 text-sm text-gray-600">
            {visitDateLabel?.replace('Visit:', '').trim() || '—'}
          </div>
          {!doctorNameResolved && doctorId ? (
            <div className="mt-1 text-[11px] text-amber-600">
              Showing doctor id (name not available).
            </div>
          ) : null}
        </Card>

        <Card className="rounded-2xl border bg-white p-4">
          <div className="text-xs text-gray-500">Print readiness</div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Prescription</span>
              <span className={rxAvailable ? 'text-emerald-700 font-semibold' : 'text-gray-400'}>
                {rxAvailable ? 'Ready' : 'Not Available'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">X-rays</span>
              <span className={xraysAvailable ? 'text-emerald-700 font-semibold' : 'text-gray-400'}>
                {xraysAvailable ? 'Ready' : 'Not Available'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-700">Bill</span>
              <span className={billAvailable ? 'text-emerald-700 font-semibold' : 'text-gray-400'}>
                {billAvailable ? 'Ready' : 'Not Available'}
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
              className="w-full max-w-sm rounded-2xl py-6 text-base"
              onClick={printRx}
              disabled={!rxAvailable}
              title={!rxAvailable ? 'No prescription available' : 'Print prescription'}
            >
              Print Prescription
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full max-w-sm rounded-2xl py-6 text-base"
              onClick={() => {
                if (!xraysAvailable) {
                  toast.info('No X-rays uploaded for this visit.');
                  return;
                }
                setXrayPrintOpen(true);
              }}
              disabled={!xraysAvailable}
              title={!xraysAvailable ? 'No X-rays uploaded' : 'Print X-rays'}
            >
              Print X-rays
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full max-w-sm rounded-2xl py-6 text-base"
              onClick={() => {
                if (!billAvailable) {
                  toast.info('No bill found for this visit.');
                  return;
                }
                setBillPrintOpen(true);
              }}
              disabled={!billAvailable}
              title={!billAvailable ? 'No bill found' : 'Print bill'}
            >
              Print Bill
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
              className="rounded-xl"
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
                    <Input
                      type="date"
                      className="mt-1 h-10 rounded-xl bg-white"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                    />
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-gray-700">Contact method</div>
                    <select
                      className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                      value={followUpContact}
                      onChange={(e) => setFollowUpContact(e.target.value as any)}
                    >
                      <option value="CALL">CALL</option>
                      <option value="SMS">SMS</option>
                      <option value="WHATSAPP">WHATSAPP</option>
                      <option value="OTHER">OTHER</option>
                    </select>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-gray-700">Reason / notes</div>
                    <Textarea
                      className="mt-1 min-h-[90px] rounded-xl bg-white"
                      placeholder="e.g., stitch removal / review pain / follow-up check"
                      value={followUpReason}
                      onChange={(e) => setFollowUpReason(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      className="w-full rounded-2xl bg-black py-5 text-white hover:bg-black/90"
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
                      className="w-full rounded-2xl py-5"
                      onClick={() => goToFollowups('list')}
                    >
                      View Follow-ups
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-4 text-sm text-gray-600">
                Follow-up is disabled.
              </div>
            )}
          </div>
        </Card>
      </div>

      <RxSheetAny
        patientName={patientName}
        patientPhone={patientPhone}
        patientAge={patientAge}
        patientSex={patientSex}
        sdId={patientSdId}
        opdNo={opdNo}
        doctorName={resolvedDoctorName}
        doctorRegdLabel={resolvedDoctorRegdLabel}
        visitDateLabel={visitCreatedDateLabel}
        lines={rx?.lines ?? []}
        receptionNotes={rx?.receptionNotes ?? ''}
      />

      <XrayPrintSheet
        open={xrayPrintOpen}
        xrayIds={xrayIds}
        onAfterPrint={() => setXrayPrintOpen(false)}
      />

      <BillPrintSheet
        open={billPrintOpen}
        billing={bill}
        patientName={patientName}
        patientPhone={patientPhone}
        doctorName={doctorLabelForCards}
        visitId={visitId}
        visitDateLabel={visitDateLabel}
        onAfterPrint={() => setBillPrintOpen(false)}
      />
    </section>
  );
}
