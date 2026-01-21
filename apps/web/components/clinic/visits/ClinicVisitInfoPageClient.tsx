'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

// ✅ Lazy-load heavy widgets (same pattern as doctor page)
const PrescriptionPreview = dynamic(
  () => import('@/components/prescription/PrescriptionPreview').then((m) => m.PrescriptionPreview),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border bg-white p-4">
        <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-4/6 animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-3/6 animate-pulse rounded bg-gray-100" />
        </div>
        <div className="mt-4 h-32 animate-pulse rounded-xl bg-gray-50" />
      </div>
    ),
  },
);

const XrayTrayReadOnly = dynamic(
  () => import('@/components/xray/XrayTrayReadOnly').then((m) => m.XrayTrayReadOnly),
  {
    ssr: false,
    loading: () => <div className="h-72 w-full animate-pulse rounded-2xl bg-gray-100" />,
  },
);

import type { ToothDetail, Visit } from '@dcm/types';

import {
  useGetVisitByIdQuery,
  useGetPatientByIdQuery,
  useGetVisitRxQuery,
  useGetVisitRxVersionsQuery,
  useUpdateVisitRxReceptionNotesMutation,
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

type UnknownRecord = Record<string, unknown>;

function LoadingDots({ label }: { label: string }) {
  const [dots, setDots] = React.useState('');
  React.useEffect(() => {
    const id = window.setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : `${d}.`));
    }, 300);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="inline-flex items-center">
      {label}
      <span className="w-4 text-left">{dots}</span>
    </span>
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

function getProp(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) return undefined;
  return obj[key];
}

function getPropString(obj: unknown, key: string): string | undefined {
  return getString(getProp(obj, key));
}

function getPropNumber(obj: unknown, key: string): number | undefined {
  return getNumber(getProp(obj, key));
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
    const data = getProp(err, 'data');
    if (isRecord(data)) {
      const msg = getString(getProp(data, 'message'));
      if (msg) return msg;
    }
    const msg = getString(getProp(err, 'message'));
    if (msg) return msg;
  }
  return 'Request failed.';
}

function anchorIdFromVisit(v: Visit): string | undefined {
  return (
    getPropString(v as unknown, 'anchorVisitId') ??
    getPropString(v as unknown, 'anchorId') ??
    undefined
  );
}

type NavAction = 'PRIMARY' | 'EDIT_BILL' | null;

export default function ClinicVisitInfoPageClient() {
  const params = useParams<{ visitId: string }>();
  const router = useRouter();
  const auth = useAuth();

  const visitId = String(params?.visitId ?? '');

  // ✅ Toggle ONLY in this page
  const [showHistory, setShowHistory] = React.useState(false);

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

  const doctorsQuery = useGetDoctorsQuery(undefined);

  // ✅ IMPORTANT: do NOT fetch visit history unless toggle is ON
  const visitsQuery = useGetPatientVisitsQuery(patientId ?? '', {
    skip: !patientId || !showHistory,
    refetchOnMountOrArgChange: true,
  });

  const allVisitsRaw = React.useMemo(() => {
    if (!showHistory) return [];
    const items = getProp(visitsQuery.data, 'items');
    return Array.isArray(items) ? (items as Visit[]) : [];
  }, [visitsQuery.data, showHistory]);

  const versionsQuery = useGetVisitRxVersionsQuery(
    { visitId },
    { skip: !visitId, refetchOnMountOrArgChange: true },
  );

  const versions = React.useMemo(() => {
    const v = getProp(versionsQuery.data, 'versions');
    return Array.isArray(v) ? (v as number[]).filter((n) => Number.isFinite(n) && n > 0) : [];
  }, [versionsQuery.data]);

  const latestVersion = React.useMemo(() => {
    if (!versions.length) return null;
    return Math.max(...versions);
  }, [versions]);

  const [selectedRxVersion, setSelectedRxVersion] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (selectedRxVersion != null) return;
    if (latestVersion != null) setSelectedRxVersion(latestVersion);
  }, [latestVersion, selectedRxVersion]);

  const rxLatestQuery = useGetVisitRxQuery(
    { visitId },
    { skip: !visitId, refetchOnMountOrArgChange: true },
  );

  const rxByVersionQuery = useGetVisitRxQuery(
    { visitId, version: selectedRxVersion ?? undefined },
    {
      skip: !visitId || selectedRxVersion == null,
      refetchOnMountOrArgChange: true,
    },
  );

  const rxToShow = React.useMemo(() => {
    const versioned = getProp(rxByVersionQuery.data, 'rx') ?? null;
    const latest = getProp(rxLatestQuery.data, 'rx') ?? null;
    return versioned ?? latest;
  }, [rxByVersionQuery.data, rxLatestQuery.data]);

  const toothDetails = React.useMemo<ToothDetail[]>(() => {
    if (!rxToShow || !isRecord(rxToShow)) return [];
    const td = getProp(rxToShow, 'toothDetails');
    return Array.isArray(td) ? (td as ToothDetail[]) : [];
  }, [rxToShow]);

  const doctorNotes = React.useMemo(() => {
    if (!rxToShow || !isRecord(rxToShow)) return '';
    return String(getProp(rxToShow, 'doctorNotes') ?? '');
  }, [rxToShow]);

  const [updateNotes, updateNotesState] = useUpdateVisitRxReceptionNotesMutation();
  const [notes, setNotes] = React.useState('');
  const hydratedRef = React.useRef(false);

  const isViewingLatest = React.useMemo(() => {
    if (latestVersion == null) return true;
    if (selectedRxVersion == null) return true;
    return selectedRxVersion === latestVersion;
  }, [selectedRxVersion, latestVersion]);

  React.useEffect(() => {
    hydratedRef.current = false;
  }, [selectedRxVersion]);

  React.useEffect(() => {
    if (!visitId) return;
    if (hydratedRef.current) return;

    const loading =
      rxLatestQuery.isLoading ||
      rxLatestQuery.isFetching ||
      rxByVersionQuery.isLoading ||
      rxByVersionQuery.isFetching;

    if (loading) return;

    hydratedRef.current = true;

    if (rxToShow && isRecord(rxToShow)) {
      const rn = getProp(rxToShow, 'receptionNotes');
      setNotes(typeof rn === 'string' ? rn : '');
    } else {
      setNotes('');
    }
  }, [
    visitId,
    rxToShow,
    rxLatestQuery.isLoading,
    rxLatestQuery.isFetching,
    rxByVersionQuery.isLoading,
    rxByVersionQuery.isFetching,
  ]);

  const onSaveNotes = async () => {
    if (!visitId) return;

    if (!rxToShow) {
      toast.error('No prescription found for this visit.');
      return;
    }

    if (!isViewingLatest) {
      toast.info('Reception Notes can be edited only on the latest prescription version.');
      return;
    }

    try {
      await updateNotes({ visitId, receptionNotes: notes }).unwrap();
      toast.success('Notes saved.');
      rxLatestQuery.refetch();
      rxByVersionQuery.refetch();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) ?? 'Failed to save notes.');
    }
  };

  const patientName = getProp(patientQuery.data, 'name') as unknown;
  const patientPhone = getProp(patientQuery.data, 'phone') as unknown;

  const patientDataUnknown: unknown = patientQuery.data;
  const patientDataRec = isRecord(patientDataUnknown) ? patientDataUnknown : undefined;

  const patientSdId = getPropString(patientQuery.data, 'sdId') ?? getString(visit?.sdId);

  const opdNo =
    getString(visit?.opdNo) ?? getString(visit?.opdId) ?? getString(visit?.opdNumber) ?? undefined;

  const patientDobRaw =
    getProp(patientQuery.data, 'dob') ??
    getProp(patientDataRec, 'dateOfBirth') ??
    getProp(patientDataRec, 'birthDate') ??
    getProp(patientDataRec, 'dobIso') ??
    null;

  const patientSexRaw =
    getProp(patientQuery.data, 'gender') ??
    getProp(patientDataRec, 'sex') ??
    getProp(patientDataRec, 'patientSex') ??
    null;

  const patientDob = safeParseDobToDate(patientDobRaw);

  const visitCreatedAtMs = getPropNumber(visit, 'createdAt') ?? Date.now();

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
    return undefined;
  }, [doctorRegNoResolved]);

  const rxVisitDateLabel = visitCreatedAtMs
    ? `Visit: ${toLocalISODate(new Date(visitCreatedAtMs))}`
    : undefined;

  const role = auth.status === 'authenticated' ? auth.role : undefined;
  const isAdmin = role === 'ADMIN';

  const visitDone = Boolean(visit && getPropString(visit, 'status') === 'DONE');
  const isCheckedOut = visit?.checkedOut === true;

  const primaryLabel = isCheckedOut ? 'Print/Followup' : 'Checkout';
  const primaryHref = isCheckedOut
    ? `/visits/${visitId}/checkout/printing`
    : `/visits/${visitId}/checkout/billing`;

  const [updateVisitStatus, updateVisitStatusState] = useUpdateVisitStatusMutation();
  const [offlineCheckoutBusy, setOfflineCheckoutBusy] = React.useState(false);

  // ✅ NEW: button-level loading for primary + edit bill
  const [navAction, setNavAction] = React.useState<NavAction>(null);

  const doOfflineCheckout = async () => {
    if (!visitId || !visit) return;

    try {
      setOfflineCheckoutBusy(true);

      if (getPropString(visit, 'status') !== 'DONE') {
        await updateVisitStatus({ visitId, status: 'DONE' }).unwrap();
        await visitQuery.refetch();
      }

      router.push(`/visits/${visitId}/checkout/billing`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) ?? 'Failed to mark visit DONE.');
      // important: allow user to click again after error
      setNavAction(null);
    } finally {
      setOfflineCheckoutBusy(false);
    }
  };

  const primaryDisabled =
    !visit ||
    offlineCheckoutBusy ||
    updateVisitStatusState.isLoading ||
    (!isCheckedOut && !visitDone && !isOfflineVisit) ||
    navAction !== null;

  const editBillDisabled = navAction !== null;

  // ✅ Build chain only when toggle is ON; otherwise keep it light (current visit only)
  const rxChain = React.useMemo(() => {
    const meta = new Map<string, Visit>();
    if (visit?.visitId) meta.set(visit.visitId, visit);

    if (!showHistory) {
      return { visitIds: [visitId], meta, currentVisitId: visitId };
    }

    for (const v of allVisitsRaw) meta.set(v.visitId, v);
    if (visit?.visitId) meta.set(visit.visitId, visit);

    const tag = getPropString(visit, 'tag');
    const anchorVisitId = getPropString(visit, 'anchorVisitId');

    const anchorId = tag === 'F' ? anchorVisitId : visitId;
    if (!anchorId) return { visitIds: [visitId], meta, currentVisitId: visitId };

    const anchor = meta.get(anchorId);
    const chain: Visit[] = [];
    if (anchor) chain.push(anchor);

    const followups: Visit[] = [];
    for (const v of meta.values()) {
      const aId = anchorIdFromVisit(v);
      if (aId && aId === anchorId && v.visitId !== anchorId) followups.push(v);
    }

    followups.sort(
      (a, b) =>
        (getPropNumber(a, 'createdAt') ?? getPropNumber(a, 'updatedAt') ?? 0) -
        (getPropNumber(b, 'createdAt') ?? getPropNumber(b, 'updatedAt') ?? 0),
    );
    chain.push(...followups);

    if (!chain.some((v) => v.visitId === visitId)) {
      const cur = meta.get(visitId);
      chain.push(cur ?? ({ visitId } as Visit));
    }

    chain.sort(
      (a, b) =>
        (getPropNumber(a, 'createdAt') ?? getPropNumber(a, 'updatedAt') ?? 0) -
        (getPropNumber(b, 'createdAt') ?? getPropNumber(b, 'updatedAt') ?? 0),
    );

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
  }, [allVisitsRaw, visit, visitId, showHistory]);

  const versionOptions = React.useMemo(() => {
    if (!versions.length) return [];
    const latest = latestVersion ?? null;
    if (!latest) return [];
    return Array.from({ length: latest }, (_, i) => latest - i);
  }, [versions, latestVersion]);

  const rxLoading =
    rxLatestQuery.isLoading ||
    rxLatestQuery.isFetching ||
    rxByVersionQuery.isLoading ||
    rxByVersionQuery.isFetching;

  const rxReady = !!rxToShow;

  type PreviewProps = React.ComponentProps<typeof PrescriptionPreview>;
  const Preview = PrescriptionPreview as React.ComponentType<PreviewProps>;

  const historyLoading = showHistory && (visitsQuery.isLoading || visitsQuery.isFetching);

  const primaryButtonLabelNode = React.useMemo(() => {
    // Offline flow: keep explicit "Preparing..." with dots
    if (offlineCheckoutBusy || updateVisitStatusState.isLoading) {
      return <LoadingDots label="Preparing" />;
    }
    // Normal route navigation
    if (navAction === 'PRIMARY') {
      return <LoadingDots label="Opening" />;
    }
    return primaryLabel;
  }, [offlineCheckoutBusy, updateVisitStatusState.isLoading, navAction, primaryLabel]);

  return (
    <section className="p-4 2xl:p-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-gray-900">Visit Info</div>
          {isOfflineVisit ? <div className="mt-1 text-xs text-amber-600">Offline visit</div> : null}
        </div>

        <div className="flex items-center gap-2">
          {isCheckedOut && isAdmin ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl cursor-pointer"
              onClick={() => {
                if (navAction) return;
                setNavAction('EDIT_BILL');
                router.push(`/visits/${visitId}/checkout/billing`);
              }}
              disabled={editBillDisabled}
            >
              {navAction === 'EDIT_BILL' ? <LoadingDots label="Opening" /> : 'Edit bill'}
            </Button>
          ) : null}

          <Button
            type="button"
            variant="default"
            className="rounded-xl bg-black text-white hover:bg-black/90 cursor-pointer"
            disabled={primaryDisabled}
            title={
              !visit
                ? 'Loading visit…'
                : isCheckedOut
                  ? 'View documents'
                  : isOfflineVisit
                    ? 'Proceed to billing (offline visit)'
                    : !visitDone
                      ? 'Checkout is allowed only when visit is DONE'
                      : 'Checkout'
            }
            onClick={() => {
              if (navAction) return;
              setNavAction('PRIMARY');

              if (isCheckedOut) {
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
            {primaryButtonLabelNode}
          </Button>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-10">
        <div className="lg:col-span-6 rounded-2xl border bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-gray-900">Prescription</div>
              <div className="text-xs text-gray-500">
                {rxLoading ? 'Loading…' : rxReady ? 'Ready' : 'No prescription'}
              </div>
            </div>

            {showHistory ? (
              <div className="mb-3 px-3 text-[11px] text-gray-600">
                {historyLoading
                  ? 'Loading visit history…'
                  : `Showing visit history (${rxChain.visitIds.length} visit${
                      rxChain.visitIds.length === 1 ? '' : 's'
                    }).`}
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <button
                type="button"
                className={[
                  'rounded-full px-3 py-1 text-[11px] font-medium transition cursor-pointer',
                  showHistory
                    ? 'bg-black text-white hover:bg-black/90'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200',
                ].join(' ')}
                onClick={() => setShowHistory((v) => !v)}
                title="Toggle previous visit history in prescription"
              >
                {showHistory ? 'Hide history' : 'Show history'}
              </button>
            </div>
          </div>

          {versionOptions.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-gray-50 px-3 py-2">
              <div className="text-xs font-medium text-gray-700">
                Prescription version
                {selectedRxVersion != null ? (
                  <span className="text-gray-500">{` • v${selectedRxVersion}`}</span>
                ) : null}
                {!isViewingLatest ? (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    Read-only (older version)
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <select
                  className="h-9 rounded-xl border bg-white px-3 text-sm"
                  value={selectedRxVersion ?? ''}
                  onChange={(e) => setSelectedRxVersion(Number(e.target.value))}
                  disabled={rxByVersionQuery.isFetching}
                >
                  {versionOptions.map((v) => (
                    <option key={v} value={v}>
                      {v === versionOptions[0] ? `Latest (v${v})` : `Version ${v}`}
                    </option>
                  ))}
                </select>

                {rxByVersionQuery.isFetching ? (
                  <span className="text-xs text-gray-500">Loading…</span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="min-w-0 overflow-hidden">
            <Preview
              patientName={patientName as PreviewProps['patientName']}
              patientPhone={patientPhone as PreviewProps['patientPhone']}
              patientAge={patientAge}
              patientSex={patientSex}
              sdId={patientSdId}
              opdNo={opdNo}
              doctorName={resolvedDoctorName}
              doctorRegdLabel={resolvedDoctorRegdLabel}
              visitDateLabel={rxVisitDateLabel}
              lines={
                isRecord(rxToShow) && Array.isArray(getProp(rxToShow, 'lines'))
                  ? (getProp(rxToShow, 'lines') as PreviewProps['lines'])
                  : []
              }
              receptionNotes={notes}
              toothDetails={toothDetails}
              currentVisitId={showHistory ? rxChain.currentVisitId : undefined}
              chainVisitIds={showHistory ? rxChain.visitIds : undefined}
              visitMetaMap={showHistory ? rxChain.meta : undefined}
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

            <div className="mt-3 min-h-20 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm text-gray-800">
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
                className="rounded-xl bg-black text-white hover:bg-black/90 cursor-pointer"
                onClick={() => void onSaveNotes()}
                disabled={updateNotesState.isLoading || !rxToShow || !isViewingLatest}
                title={
                  !rxToShow
                    ? 'No prescription found'
                    : !isViewingLatest
                      ? 'Editing disabled for older versions'
                      : 'Save notes'
                }
              >
                {updateNotesState.isLoading ? <LoadingDots label="Saving" /> : 'Save'}
              </Button>
            </div>

            <Textarea
              className="mt-3 min-h-30 rounded-xl"
              placeholder={
                !isViewingLatest
                  ? 'Reception Notes are read-only for older versions. Switch to Latest to edit.'
                  : 'Add reception notes (will print on the prescription)…'
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!rxToShow || !isViewingLatest}
            />

            {!rxToShow ? (
              <div className="mt-2 text-xs text-amber-600">
                No prescription found for this visit. Notes require a prescription.
              </div>
            ) : !isViewingLatest ? (
              <div className="mt-2 text-xs text-amber-600">
                You’re viewing an older prescription version. Switch to <b>Latest</b> to edit notes.
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </section>
  );
}
