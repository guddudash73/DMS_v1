// apps/web/app/(clinic)/visits/[visitId]/page.tsx
'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

import { PrescriptionPreview } from '@/components/prescription/PrescriptionPreview';
import { PrescriptionPrintSheet } from '@/components/prescription/PrescriptionPrintSheet';

import { XrayTrayReadOnly } from '@/components/xray/XrayTrayReadOnly';
import { XrayPrintSheet } from '@/components/xray/XrayPrintSheet';

import {
  useGetVisitByIdQuery,
  useGetPatientByIdQuery,
  useGetVisitRxQuery,
  useListVisitXraysQuery,
  useUpdateVisitRxReceptionNotesMutation,
  useGetVisitBillQuery,
  useGetDoctorsQuery,
  useGetPatientVisitsQuery, // ✅ NEW
} from '@/src/store/api';
import { useAuth } from '@/src/hooks/useAuth';
import type { ToothDetail, Visit } from '@dms/types';

type PatientSex = 'M' | 'F' | 'O' | 'U';

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

export default function ClinicVisitInfoPage() {
  const params = useParams<{ visitId: string }>();
  const router = useRouter();
  const auth = useAuth();

  const visitId = String(params?.visitId ?? '');

  const visitQuery = useGetVisitByIdQuery(visitId, {
    skip: !visitId,
    refetchOnMountOrArgChange: true,
  });

  const visit = visitQuery.data as any;
  const patientId = visit?.patientId as string | undefined;

  const patientQuery = useGetPatientByIdQuery(patientId ?? '', {
    skip: !patientId,
    refetchOnMountOrArgChange: true,
  });

  const rxQuery = useGetVisitRxQuery(
    { visitId },
    {
      skip: !visitId,
      refetchOnMountOrArgChange: true,
    },
  );

  const xraysQuery = useListVisitXraysQuery(
    { visitId },
    {
      skip: !visitId,
      refetchOnMountOrArgChange: true,
    },
  );

  const billQuery = useGetVisitBillQuery({ visitId }, { skip: !visitId });
  const bill = billQuery.data ?? null;
  const billNotFound = (billQuery as any)?.error?.status === 404;

  const role = auth.status === 'authenticated' ? auth.role : undefined;
  const isAdmin = role === 'ADMIN';

  const doctorsQuery = useGetDoctorsQuery(undefined);

  // ✅ NEW: fetch patient visits so we can show history blocks up to selected visit
  const visitsQuery = useGetPatientVisitsQuery(patientId ?? '', {
    skip: !patientId,
    refetchOnMountOrArgChange: true,
  });
  const allVisitsRaw = (visitsQuery.data?.items ?? []) as Visit[];

  React.useEffect(() => {
    if (!visitId) return;

    visitQuery.refetch();
    rxQuery.refetch();
    xraysQuery.refetch();
    billQuery.refetch?.();

    hydratedRef.current = false;
    setNotes('');
  }, [visitId]);

  React.useEffect(() => {
    if (!patientId) return;
    patientQuery.refetch();
    visitsQuery.refetch?.();
  }, [patientId]);

  const xrayIds = (xraysQuery.data?.items ?? []).map((x) => x.xrayId);

  const [updateNotes, updateNotesState] = useUpdateVisitRxReceptionNotesMutation();
  const rx = rxQuery.data?.rx ?? null;

  // ✅ extract toothDetails from rx
  const toothDetails = React.useMemo(() => {
    const td = (rx as any)?.toothDetails ?? [];
    return Array.isArray(td) ? (td as ToothDetail[]) : ([] as ToothDetail[]);
  }, [rx]);

  const [notes, setNotes] = React.useState('');
  const hydratedRef = React.useRef(false);

  React.useEffect(() => {
    if (!rxQuery.isSuccess) return;
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    setNotes(rx?.receptionNotes ?? '');
  }, [rxQuery.isSuccess, rx?.receptionNotes]);

  const [xrayPrintOpen, setXrayPrintOpen] = React.useState(false);

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
    } catch (err: any) {
      toast.error(err?.data?.message ?? err?.message ?? 'Failed to save notes.');
    }
  };

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

  const rxVisitDateLabel = visitCreatedAtMs
    ? `Visit: ${toLocalISODate(new Date(visitCreatedAtMs))}`
    : undefined;

  const visitDone = !!visit && visit.status === 'DONE';

  const hasBill = !!bill;
  const primaryLabel = hasBill ? 'Print/Followup' : 'Checkout';
  const primaryHref = hasBill
    ? `/visits/${visitId}/checkout/printing`
    : `/visits/${visitId}/checkout/billing`;

  const primaryDisabled = !visit || !visitDone;

  // kept (existing pattern)
  const PreviewAny: any = PrescriptionPreview;
  const PrintSheetAny: any = PrescriptionPrintSheet;

  /**
   * ✅ NEW:
   * Build a LIMITED chain (anchor + followups) up to the selected visitId (inclusive),
   * same logic as prescription printing page.
   */
  const rxChain = React.useMemo(() => {
    const meta = new Map<string, Visit>();

    for (const v of allVisitsRaw) meta.set(v.visitId, v);
    if ((visit as any)?.visitId) meta.set((visit as any).visitId, visit as any);

    const tag = (visit as any)?.tag as string | undefined;
    const anchorVisitId = (visit as any)?.anchorVisitId as string | undefined;

    const anchorId = tag === 'F' ? anchorVisitId : visitId;
    if (!anchorId) return { visitIds: [visitId], meta, currentVisitId: visitId };

    const anchor = meta.get(anchorId);
    const chain: Visit[] = [];

    if (anchor) chain.push(anchor);

    const followups: Visit[] = [];
    for (const v of meta.values()) {
      const aId = (v as any)?.anchorVisitId as string | undefined;
      if (aId && aId === anchorId && v.visitId !== anchorId) followups.push(v);
    }

    followups.sort((a, b) => (a.createdAt ?? a.updatedAt ?? 0) - (b.createdAt ?? b.updatedAt ?? 0));
    chain.push(...followups);

    if (!chain.some((v) => v.visitId === visitId)) {
      const cur = meta.get(visitId);
      chain.push(cur ?? ({ visitId } as any));
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
        </div>

        <div className="flex items-center gap-2">
          {/* ✅ Admin-only: edit bill if already checked out */}
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
                : !visitDone
                  ? 'Checkout is allowed only when visit is DONE'
                  : hasBill
                    ? 'View documents'
                    : 'Checkout'
            }
            onClick={() => router.push(primaryHref)}
          >
            {primaryLabel}
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
            <PreviewAny
              patientName={patientName}
              patientPhone={patientPhone}
              patientAge={patientAge}
              patientSex={patientSex}
              sdId={patientSdId}
              opdNo={opdNo}
              doctorName={resolvedDoctorName}
              doctorRegdLabel={resolvedDoctorRegdLabel}
              visitDateLabel={rxVisitDateLabel}
              lines={rx?.lines ?? []}
              receptionNotes={notes}
              toothDetails={toothDetails}
              // ✅ NEW: show history blocks up to the selected visit (inclusive), same as printing page
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
