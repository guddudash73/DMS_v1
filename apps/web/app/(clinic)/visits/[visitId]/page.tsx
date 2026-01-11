'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

import { PrescriptionPreview } from '@/components/prescription/PrescriptionPreview';
import { XrayTrayReadOnly } from '@/components/xray/XrayTrayReadOnly';

import type { ToothDetail, Visit } from '@dms/types';

import {
  useGetVisitByIdQuery,
  useGetPatientByIdQuery,
  useGetVisitRxQuery,
  useListVisitXraysQuery,
  useUpdateVisitRxReceptionNotesMutation,
  useGetVisitBillQuery,
  useGetDoctorsQuery,
  useGetPatientVisitsQuery,
  useUpdateVisitStatusMutation,
} from '@/src/store/api';
import { useAuth } from '@/src/hooks/useAuth';

type PatientSex = 'M' | 'F' | 'O' | 'U';

type VisitExtras = {
  isOffline?: boolean;
  opdNo?: string;
  opdId?: string;
  opdNumber?: string;
  sdId?: string;
  doctorId?: string;
  anchorVisitId?: string;
  tag?: string;
};
type VisitWithExtras = Visit & VisitExtras;

type DoctorLite = {
  doctorId: string;
  fullName?: string;
  name?: string;
  displayName?: string;
  registrationNumber?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

function getNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
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

  if (dob instanceof Date) return Number.isFinite(dob.getTime()) ? dob : null;

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

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;

  if (isRecord(err)) {
    const data = err.data;
    if (isRecord(data)) {
      const msg = getString(data.message);
      if (msg) return msg;
    }
    const msg = getString(err.message);
    if (msg) return msg;
  }
  return 'Request failed.';
}

export default function ClinicVisitInfoPage() {
  const params = useParams<{ visitId: string }>();
  const router = useRouter();
  const auth = useAuth();

  const visitId = String(params?.visitId ?? '');

  const visitQuery = useGetVisitByIdQuery(visitId, {
    skip: !visitId,
    refetchOnMountOrArgChange: true,
  });

  const visit = (visitQuery.data ?? null) as VisitWithExtras | null;
  const isOfflineVisit = Boolean(visit?.isOffline);

  const patientId = visit?.patientId;

  const patientQuery = useGetPatientByIdQuery(patientId ?? '', {
    skip: !patientId,
    refetchOnMountOrArgChange: true,
  });

  const rxQuery = useGetVisitRxQuery(
    { visitId },
    { skip: !visitId, refetchOnMountOrArgChange: true },
  );

  const xraysQuery = useListVisitXraysQuery(
    { visitId },
    { skip: !visitId, refetchOnMountOrArgChange: true },
  );

  const billQuery = useGetVisitBillQuery({ visitId }, { skip: !visitId });
  const bill = billQuery.data ?? null;

  const role = auth.status === 'authenticated' ? auth.role : undefined;
  const isAdmin = role === 'ADMIN';

  const doctorsQuery = useGetDoctorsQuery(undefined);

  const visitsQuery = useGetPatientVisitsQuery(patientId ?? '', {
    skip: !patientId,
    refetchOnMountOrArgChange: true,
  });

  const allVisitsRaw = React.useMemo(() => {
    const items = visitsQuery.data?.items;
    return Array.isArray(items) ? (items as Visit[]) : [];
  }, [visitsQuery.data?.items]);

  React.useEffect(() => {
    if (!visitId) return;
    visitQuery.refetch();
    rxQuery.refetch();
    xraysQuery.refetch();
    billQuery.refetch?.();
    hydratedRef.current = false;
    setNotes('');
  }, [visitId, visitQuery, rxQuery, xraysQuery, billQuery]);

  React.useEffect(() => {
    if (!patientId) return;
    patientQuery.refetch();
    visitsQuery.refetch?.();
  }, [patientId, patientQuery, visitsQuery]);

  const [updateNotes, updateNotesState] = useUpdateVisitRxReceptionNotesMutation();
  const rx = rxQuery.data?.rx ?? null;

  const toothDetails = React.useMemo<ToothDetail[]>(() => {
    if (!rx || !isRecord(rx)) return [];
    const td = rx.toothDetails;
    return Array.isArray(td) ? (td as ToothDetail[]) : [];
  }, [rx]);

  const doctorNotes = React.useMemo(() => {
    if (!rx || !isRecord(rx)) return '';
    return String(rx.doctorNotes ?? '');
  }, [rx]);

  const [notes, setNotes] = React.useState('');
  const hydratedRef = React.useRef(false);

  React.useEffect(() => {
    if (!rxQuery.isSuccess) return;
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    if (rx && isRecord(rx)) {
      setNotes(typeof rx.receptionNotes === 'string' ? rx.receptionNotes : '');
    } else {
      setNotes('');
    }
  }, [rxQuery.isSuccess, rx]);

  const onSaveNotes = async () => {
    if (!visitId) return;
    if (!rx) {
      toast.error('No prescription found for this visit.');
      return;
    }

    try {
      await updateNotes({ visitId, receptionNotes: notes }).unwrap();
      toast.success('Notes saved.');
      rxQuery.refetch();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) ?? 'Failed to save notes.');
    }
  };

  const patientName = patientQuery.data?.name;
  const patientPhone = patientQuery.data?.phone;

  // ✅ patientQuery.data is typed; only use real fields from it.
  // ✅ if you still want fallback reads, use an untyped record (safe).
  const patientDataUnknown: unknown = patientQuery.data;
  const patientDataRec = isRecord(patientDataUnknown) ? patientDataUnknown : undefined;

  const patientSdId = getString(patientQuery.data?.sdId) ?? getString(visit?.sdId);

  const opdNo =
    getString(visit?.opdNo) ?? getString(visit?.opdId) ?? getString(visit?.opdNumber) ?? undefined;

  const patientDobRaw =
    patientQuery.data?.dob ??
    patientDataRec?.dateOfBirth ??
    patientDataRec?.birthDate ??
    patientDataRec?.dobIso ??
    null;

  const patientSexRaw =
    patientQuery.data?.gender ?? patientDataRec?.sex ?? patientDataRec?.patientSex ?? null;

  const patientDob = safeParseDobToDate(patientDobRaw);

  const visitCreatedAtMs = getNumber(visit?.createdAt) ?? Date.now();

  const patientAge = patientDob ? calculateAge(patientDob, new Date(visitCreatedAtMs)) : undefined;
  const patientSex = normalizeSex(patientSexRaw);

  const doctorId = getString(visit?.doctorId);

  const doctorFromList = React.useMemo<DoctorLite | null>(() => {
    const list = doctorsQuery.data;
    if (!doctorId || !Array.isArray(list)) return null;

    const mapped = (list as unknown[]).filter(isRecord).map((d) => d as unknown as DoctorLite);

    return mapped.find((d) => d.doctorId === doctorId) ?? null;
  }, [doctorsQuery.data, doctorId]);

  const doctorNameResolved =
    doctorFromList?.fullName ?? doctorFromList?.name ?? doctorFromList?.displayName ?? undefined;

  const doctorRegNoResolved = doctorFromList?.registrationNumber ?? undefined;

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

  const rxVisitDateLabel = visitCreatedAtMs
    ? `Visit: ${toLocalISODate(new Date(visitCreatedAtMs))}`
    : undefined;

  const visitDone = Boolean(visit && visit.status === 'DONE');
  const hasBill = Boolean(bill);

  const primaryLabel = hasBill ? 'Print/Followup' : 'Checkout';
  const primaryHref = hasBill
    ? `/visits/${visitId}/checkout/printing`
    : `/visits/${visitId}/checkout/billing`;

  const [updateVisitStatus, updateVisitStatusState] = useUpdateVisitStatusMutation();
  const [offlineCheckoutBusy, setOfflineCheckoutBusy] = React.useState(false);

  const doOfflineCheckout = async () => {
    if (!visitId || !visit) return;

    try {
      setOfflineCheckoutBusy(true);

      if (visit.status !== 'DONE') {
        await updateVisitStatus({ visitId, status: 'DONE' }).unwrap();
        await visitQuery.refetch();
      }

      router.push(`/visits/${visitId}/checkout/billing`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) ?? 'Failed to mark visit DONE.');
    } finally {
      setOfflineCheckoutBusy(false);
    }
  };

  const primaryDisabled =
    !visit ||
    offlineCheckoutBusy ||
    updateVisitStatusState.isLoading ||
    (!hasBill && !visitDone && !isOfflineVisit);

  type PreviewProps = React.ComponentProps<typeof PrescriptionPreview>;
  const Preview = PrescriptionPreview as React.ComponentType<PreviewProps>;

  const rxChain = React.useMemo(() => {
    const meta = new Map<string, Visit>();
    for (const v of allVisitsRaw) meta.set(v.visitId, v);
    if (visit?.visitId) meta.set(visit.visitId, visit);

    const tag = getString(visit?.tag);
    const anchorVisitId = getString(visit?.anchorVisitId);

    const anchorId = tag === 'F' ? anchorVisitId : visitId;
    if (!anchorId) return { visitIds: [visitId], meta, currentVisitId: visitId };

    const anchor = meta.get(anchorId);
    const chain: Visit[] = [];
    if (anchor) chain.push(anchor);

    const followups: Visit[] = [];
    for (const v of meta.values()) {
      const vRec = isRecord(v) ? v : ({} as Record<string, unknown>);
      const aId = getString(vRec.anchorVisitId);
      if (aId && aId === anchorId && v.visitId !== anchorId) followups.push(v);
    }

    followups.sort((a, b) => (a.createdAt ?? a.updatedAt ?? 0) - (b.createdAt ?? b.updatedAt ?? 0));
    chain.push(...followups);

    if (!chain.some((v) => v.visitId === visitId)) {
      const cur = meta.get(visitId);
      chain.push(cur ?? ({ visitId } as Visit));
    }

    chain.sort((a, b) => (a.createdAt ?? a.updatedAt ?? 0) - (b.createdAt ?? b.updatedAt ?? 0));

    const seen = new Set<string>();
    const chainIdsOrdered = chain
      .map((v) => v.visitId)
      .filter((id) => {
        if (!id) return false;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

    const idx = chainIdsOrdered.indexOf(visitId);
    const limitedIds = idx >= 0 ? chainIdsOrdered.slice(0, idx + 1) : [visitId];

    return { visitIds: limitedIds, meta, currentVisitId: visitId };
  }, [allVisitsRaw, visit, visitId]);

  return (
    <section className="p-4 2xl:p-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-gray-900">Visit Info</div>
          <div className="text-xs text-gray-500">{visitId ? `Visit ID: ${visitId}` : ''}</div>
          {isOfflineVisit ? <div className="text-xs text-amber-600 mt-1">Offline visit</div> : null}
        </div>

        <div className="flex items-center gap-2">
          {hasBill && isAdmin ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => router.push(`/visits/${visitId}/checkout/billing`)}
            >
              Edit bill
            </Button>
          ) : null}

          <Button
            type="button"
            variant="default"
            className="rounded-xl bg-black text-white hover:bg-black/90"
            disabled={primaryDisabled}
            title={
              !visit
                ? 'Loading visit…'
                : hasBill
                  ? 'View documents'
                  : isOfflineVisit
                    ? 'Proceed to billing (offline visit)'
                    : !visitDone
                      ? 'Checkout is allowed only when visit is DONE'
                      : 'Checkout'
            }
            onClick={() => {
              if (hasBill) {
                router.push(primaryHref);
                return;
              }
              if (isOfflineVisit) {
                void doOfflineCheckout();
                return;
              }
              router.push(primaryHref);
            }}
          >
            {offlineCheckoutBusy ? 'Preparing…' : primaryLabel}
          </Button>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-10">
        <div className="lg:col-span-6 rounded-2xl bg-white p-4 border">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-lg font-semibold text-gray-900">Prescription</div>
            <div className="text-xs text-gray-500">
              {rxQuery.isLoading || rxQuery.isFetching
                ? 'Loading…'
                : rx
                  ? 'Ready'
                  : 'No prescription'}
            </div>
          </div>

          <div className="min-w-0 overflow-hidden">
            <Preview
              patientName={patientName}
              patientPhone={patientPhone}
              patientAge={patientAge}
              patientSex={patientSex}
              sdId={patientSdId}
              opdNo={opdNo}
              doctorName={resolvedDoctorName}
              doctorRegdLabel={resolvedDoctorRegdLabel}
              visitDateLabel={rxVisitDateLabel}
              lines={
                isRecord(rx) && Array.isArray(rx.lines) ? (rx.lines as PreviewProps['lines']) : []
              }
              receptionNotes={notes}
              toothDetails={toothDetails}
              currentVisitId={rxChain.currentVisitId}
              chainVisitIds={rxChain.visitIds}
              visitMetaMap={rxChain.meta}
            />
          </div>
        </div>

        <Card className="lg:col-span-4 rounded-2xl border bg-white p-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="text-lg font-semibold text-gray-900">X-ray Tray</div>
          </div>

          <div className="mt-3">
            <XrayTrayReadOnly visitId={visitId} />
          </div>

          <div className="mt-4 rounded-2xl border bg-white p-3">
            <div className="text-sm font-semibold text-gray-900">Doctor Notes</div>
            <div className="text-xs text-gray-500">
              Internal note from doctor for reception. This will NOT print.
            </div>

            <div className="mt-3 min-h-[80px] whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm text-gray-800">
              {doctorNotes.trim() ? doctorNotes : '—'}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">Reception Notes</div>
                <div className="text-xs text-gray-500">
                  These notes will appear on prescription & print.
                </div>
              </div>

              <Button
                type="button"
                variant="default"
                className="rounded-xl bg-black text-white hover:bg-black/90"
                onClick={() => void onSaveNotes()}
                disabled={updateNotesState.isLoading || !rx}
                title={!rx ? 'No prescription found' : 'Save notes'}
              >
                {updateNotesState.isLoading ? 'Saving…' : 'Save'}
              </Button>
            </div>

            <Textarea
              className="mt-3 rounded-xl min-h-[120px]"
              placeholder="Add reception notes (will print on the prescription)…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!rx}
            />

            {!rx ? (
              <div className="mt-2 text-xs text-amber-600">
                No prescription found for this visit. Notes require a prescription.
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </section>
  );
}
