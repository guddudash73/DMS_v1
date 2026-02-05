// apps/web/components/doctor/visits/DoctorVisitPageClient.tsx
'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

import {
  useGetVisitByIdQuery,
  useGetPatientByIdQuery,
  useGetVisitRxQuery,
  useUpdateVisitStatusMutation,
  useGetDoctorsQuery,
  useStartVisitRxRevisionMutation,
  useGetAssistantsQuery,
} from '@/src/store/api';

import { useAuth } from '@/src/hooks/useAuth';
import { ArrowRight, Stethoscope } from 'lucide-react';

import type { Visit, Assistant } from '@dcm/types';

// Lazy-load DONE view (heavy: Rx preview + X-rays + history + calendar)
const DoctorVisitDoneView = dynamic(
  () => import('./DoctorVisitDoneView').then((m) => m.DoctorVisitDoneView),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-6 rounded-2xl border bg-white p-4">
          <div className="h-5 w-40 animate-pulse rounded bg-gray-100" />
          <div className="mt-4 h-80 animate-pulse rounded-xl bg-gray-50" />
        </Card>
        <Card className="lg:col-span-6 rounded-2xl border bg-white p-4">
          <div className="h-5 w-24 animate-pulse rounded bg-gray-100" />
          <div className="mt-4 h-80 animate-pulse rounded-xl bg-gray-50" />
        </Card>
      </div>
    ),
  },
);

type PatientSex = 'M' | 'F' | 'O' | 'U';

type DoctorLite = {
  doctorId: string;
  fullName?: string;
  displayName?: string;
  name?: string;
  registrationNumber?: string;
};

type VisitExtras = {
  isOffline?: boolean;
  opdNo?: string;
  opdId?: string;
  opdNumber?: string;
  tag?: string;
  anchorVisitId?: string;

  assistantId?: string;
  assistantName?: string;
};
type VisitWithExtras = Visit & VisitExtras;

type UnknownRecord = Record<string, unknown>;

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

function getPropNumber(obj: unknown, key: string): number | undefined {
  return getNumber(getProp(obj, key));
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

/* ------------------------------------------------------------------ */
/* patient helpers (backend-aligned, same intent as DoctorVisitDoneView) */
/* ------------------------------------------------------------------ */

function safeParseDobToDate(dob: unknown): Date | null {
  if (typeof dob !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(y, mo, d);
  return Number.isFinite(date.getTime()) ? date : null;
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
  if (s === 'MALE' || s === 'M') return 'M';
  if (s === 'FEMALE' || s === 'F') return 'F';
  if (s === 'OTHER' || s === 'O') return 'O';
  if (s === 'UNKNOWN' || s === 'U') return 'U';
  return undefined;
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

/* ------------------------------------------------------------------ */
/* assistant helpers                                                   */
/* ------------------------------------------------------------------ */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v: string) {
  return UUID_RE.test(v);
}

export function DoctorVisitPageClient() {
  const params = useParams<{ visitId: string }>();
  const router = useRouter();
  const auth = useAuth();

  const visitId = React.useMemo(() => String(params?.visitId ?? ''), [params?.visitId]);
  const doctorId = auth.userId ?? '';

  const visitQuery = useGetVisitByIdQuery(visitId, { skip: !visitId });
  const visit = (visitQuery.data ?? null) as VisitWithExtras | null;

  const isOffline = Boolean(visit?.isOffline);

  const patientId = visit?.patientId ?? '';
  const patientQuery = useGetPatientByIdQuery(patientId, { skip: !patientId });

  const rxQuery = useGetVisitRxQuery({ visitId }, { skip: !visitId });
  const rxLatest = (getProp(rxQuery.data, 'rx') as unknown) ?? null;

  const [updateVisitStatus, updateVisitStatusState] = useUpdateVisitStatusMutation();
  const [startRevision, startRevisionState] = useStartVisitRxRevisionMutation();

  const doctorsQuery = useGetDoctorsQuery(undefined);

  /* ---------------- assistants ---------------- */

  const assistantsQuery = useGetAssistantsQuery(undefined);
  const assistants = React.useMemo<Assistant[]>(() => {
    const items = (assistantsQuery.data as any)?.items;
    return Array.isArray(items) ? (items as Assistant[]) : [];
  }, [assistantsQuery.data]);

  const activeAssistants = React.useMemo(() => {
    return assistants
      .filter((a) => Boolean(a?.active))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assistants]);

  const storedAssistantId = getString(getProp(visit as unknown, 'assistantId'));
  const storedAssistantName = getString(getProp(visit as unknown, 'assistantName'));

  // ✅ only allow choosing assistant when visit is editable (and not offline)
  const canChooseAssistant =
    !isOffline && (visit?.status === 'QUEUED' || visit?.status === 'IN_PROGRESS');

  // ✅ Selection state is VISIT-SCOPED (no leakage across visits)
  const [selectedAssistantId, setSelectedAssistantId] = React.useState<string>('');

  // ✅ visit-scoped sessionStorage key
  const assistantCacheKey = React.useMemo(() => {
    return visitId ? `dcm:visit:${visitId}:assistantId` : '';
  }, [visitId]);

  // Restore selection (ONLY for this visitId)
  React.useEffect(() => {
    // If visit already has assistant stored, reflect it and stop.
    if (storedAssistantId) {
      setSelectedAssistantId(storedAssistantId);
      return;
    }

    // Only allow restoring cached selection when assistant can be chosen
    if (!canChooseAssistant) {
      setSelectedAssistantId('');
      return;
    }

    if (!assistantCacheKey) return;
    if (typeof window === 'undefined') return;

    try {
      const prev = window.sessionStorage.getItem(assistantCacheKey)?.trim() ?? '';
      if (prev && isUuid(prev)) setSelectedAssistantId(prev);
      else window.sessionStorage.removeItem(assistantCacheKey);
    } catch {}
  }, [storedAssistantId, assistantCacheKey, canChooseAssistant]);

  // Persist selection (ONLY for this visitId + only while selectable)
  React.useEffect(() => {
    if (!assistantCacheKey) return;
    if (typeof window === 'undefined') return;

    // If visit is DONE / not selectable, never persist and remove any cached value
    if (!canChooseAssistant) {
      try {
        window.sessionStorage.removeItem(assistantCacheKey);
      } catch {}
      return;
    }

    // If backend already stored one, do not overwrite
    if (storedAssistantId) return;

    try {
      const v = selectedAssistantId.trim();
      if (v && isUuid(v)) window.sessionStorage.setItem(assistantCacheKey, v);
      else window.sessionStorage.removeItem(assistantCacheKey);
    } catch {}
  }, [assistantCacheKey, selectedAssistantId, storedAssistantId, canChooseAssistant]);

  // Auto-clean stale UUIDs (e.g., assistant deleted/inactive)
  React.useEffect(() => {
    if (storedAssistantId) return;
    if (!selectedAssistantId) return;

    if (!isUuid(selectedAssistantId)) {
      setSelectedAssistantId('');
      return;
    }

    const ok = activeAssistants.some((a) => a.assistantId === selectedAssistantId);
    if (!ok) setSelectedAssistantId('');
  }, [storedAssistantId, selectedAssistantId, activeAssistants]);

  const selectedAssistant = React.useMemo(() => {
    // only consider selection when you can choose assistant
    const id =
      storedAssistantId ?? (canChooseAssistant ? selectedAssistantId || undefined : undefined);

    if (!id) return null;
    return activeAssistants.find((a) => a.assistantId === id) ?? null;
  }, [activeAssistants, selectedAssistantId, storedAssistantId, canChooseAssistant]);

  // ✅ Show "(selected)" only when user can choose assistant AND visit has no stored assistant
  const pendingAssistantLabel =
    canChooseAssistant && !storedAssistantId ? selectedAssistant?.name : undefined;

  // ✅ For display: ONLY visit-specific stored assistant name (no fallback)
  const assistantLabelForUI = storedAssistantName ?? undefined;

  // Decide what assistantId (if any) to send when starting the session
  const resolvedAssistantId = React.useMemo(() => {
    // If backend already stored one, always use it (read-only)
    if (storedAssistantId) return storedAssistantId;

    const v = selectedAssistantId.trim();
    if (!v || !isUuid(v)) return undefined;

    const ok = activeAssistants.some((a) => a.assistantId === v);
    return ok ? v : undefined;
  }, [storedAssistantId, selectedAssistantId, activeAssistants]);

  /* ---------------- doctor display ---------------- */

  const doctorFromList = React.useMemo<DoctorLite | null>(() => {
    const list = doctorsQuery.data;
    if (!doctorId || !Array.isArray(list)) return null;
    const mapped = (list as unknown[]).filter(isRecord).map((d) => d as unknown as DoctorLite);
    return mapped.find((d) => d.doctorId === doctorId) ?? null;
  }, [doctorsQuery.data, doctorId]);

  const doctorLabel = React.useMemo(() => {
    const name = doctorFromList?.fullName ?? doctorFromList?.displayName ?? doctorFromList?.name;
    return name ?? (doctorId ? `Doctor (${doctorId})` : 'Doctor');
  }, [doctorFromList, doctorId]);

  const doctorRegdLabel = React.useMemo(() => {
    const reg = doctorFromList?.registrationNumber;
    return reg ? `B.D.S Regd. - ${reg}` : undefined;
  }, [doctorFromList]);

  const status = visit?.status;
  const isDone = status === 'DONE';

  const visitDate = visit?.visitDate ?? '';
  const visitDateLabel = visitDate ? `Visit: ${visitDate}` : undefined;

  const patient = patientQuery.data ?? null;

  // Backend-aligned age/sex (DOB preferred; fallback to stored age)
  const visitAt = React.useMemo(() => {
    const ts = getPropNumber(visit as unknown, 'createdAt') ?? Date.now();
    return new Date(ts);
  }, [visit]);

  const patientDobRaw = getProp(patient, 'dob');
  const patientAgeRaw = getProp(patient, 'age');

  const dob = safeParseDobToDate(patientDobRaw);
  const ageFromDob = dob ? calculateAge(dob, visitAt) : undefined;
  const ageStored =
    typeof patientAgeRaw === 'number' && Number.isFinite(patientAgeRaw) ? patientAgeRaw : undefined;

  const patientAge = ageFromDob ?? ageStored;

  const patientSex =
    normalizeSex(
      getProp(patient, 'gender') ?? getProp(patient, 'sex') ?? getProp(patient, 'patientSex'),
    ) ?? 'U';

  const opdNo = getString(visit?.opdNo) ?? getString(visit?.opdId) ?? undefined;

  const loading = visitQuery.isLoading || patientQuery.isLoading;
  const hasError = visitQuery.isError || patientQuery.isError;

  const sessionMuted = isOffline === true;
  const sessionMutedReason =
    'This is an offline visit. Session editing is disabled in Doctor view.';

  /* ---------------- proceed-without-assistant confirm ---------------- */

  const [noAssistantConfirmOpen, setNoAssistantConfirmOpen] = React.useState(false);

  // In UI, "selectedAssistantId" might be '', but user could still proceed.
  // We only consider a valid assistant selection if it is a UUID AND exists in activeAssistants.
  const hasValidAssistantSelected = Boolean(resolvedAssistantId);
  const canProceedWithoutAssistant = true; // business rule: assistant optional

  const startQueuedSession = async (opts?: { proceededWithoutAssistant?: boolean }) => {
    if (sessionMuted) {
      toast.info(sessionMutedReason);
      return;
    }
    if (!visitId) return;

    try {
      if (opts?.proceededWithoutAssistant) {
        toast.warn('Proceeding without selecting an assistant.');
      }

      await updateVisitStatus({
        visitId,
        status: 'IN_PROGRESS',
        date: visit?.visitDate,

        // ✅ Only send when it is a valid UUID + active assistant
        ...(resolvedAssistantId !== undefined ? { assistantId: resolvedAssistantId } : {}),
      }).unwrap();

      toast.success('Session started.');
      router.push(`/doctor/visits/${visitId}/prescription`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) ?? 'Failed to start session.');
    }
  };

  const onStartRevision = async () => {
    if (!visitId) return;

    if (sessionMuted) {
      toast.info(sessionMutedReason);
      return;
    }

    try {
      await startRevision({ visitId }).unwrap();
      toast.success('Revision started.');
      router.push(`/doctor/visits/${visitId}/prescription`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) ?? 'Failed to start revision.');
    }
  };

  const openSession = async () => {
    if (sessionMuted) {
      toast.info(sessionMutedReason);
      return;
    }

    if (!visitId) return;

    if (!doctorId) {
      toast.error('Missing doctor session. Please re-login.');
      return;
    }

    // If already in progress, continue without forcing assistant selection
    if (status === 'IN_PROGRESS') {
      if (!storedAssistantId && !selectedAssistantId) {
        toast.info('Tip: You can select an assistant (optional) before starting.');
      }
      router.push(`/doctor/visits/${visitId}/prescription`);
      return;
    }

    if (status === 'QUEUED') {
      // Confirm only when user has not selected a valid assistant
      if (!hasValidAssistantSelected && canProceedWithoutAssistant) {
        setNoAssistantConfirmOpen(true);
        return;
      }

      await startQueuedSession();
      return;
    }

    router.push(`/doctor/visits/${visitId}/prescription`);
  };

  if (!visitId) {
    return (
      <section className="p-6">
        <p className="text-sm text-red-600">Invalid visit id.</p>
      </section>
    );
  }

  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      {/* Proceed without assistant confirm dialog */}
      <Dialog open={noAssistantConfirmOpen} onOpenChange={setNoAssistantConfirmOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>No assistant selected</DialogTitle>
            <DialogDescription>
              You haven’t selected an assistant for this visit. Do you want to proceed without one?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setNoAssistantConfirmOpen(false)}
              disabled={updateVisitStatusState.isLoading || sessionMuted}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-black text-white hover:bg-black/90"
              onClick={async () => {
                setNoAssistantConfirmOpen(false);
                await startQueuedSession({ proceededWithoutAssistant: true });
              }}
              disabled={updateVisitStatusState.isLoading || sessionMuted}
            >
              Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-lg font-semibold text-gray-900">Visit</div>

            {isOffline ? (
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                OFFLINE
              </span>
            ) : null}
          </div>

          <div className="mt-0.5 text-xs text-gray-500">
            {visit?.tag ? (
              <>
                Tag: <span className="font-medium text-gray-700">{visit.tag}</span>
                {' · '}
              </>
            ) : null}
            Stage: <span className="font-medium text-gray-700">{stageLabel(status)}</span>
            {assistantLabelForUI ? (
              <>
                {' · '}Assistant:{' '}
                <span className="font-medium text-gray-700">{assistantLabelForUI}</span>
              </>
            ) : pendingAssistantLabel ? (
              <>
                {' · '}Assistant:{' '}
                <span className="font-medium text-gray-700">
                  {pendingAssistantLabel} <span className="text-gray-400">(selected)</span>
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {isDone ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl cursor-pointer"
              onClick={onStartRevision}
              disabled={sessionMuted || startRevisionState.isLoading || loading || hasError}
              title={sessionMuted ? sessionMutedReason : 'Start editing this DONE visit'}
            >
              {startRevisionState.isLoading ? 'Starting…' : 'Start Revision'}
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            className="rounded-xl cursor-pointer"
            onClick={() => router.back()}
          >
            Back
          </Button>

          {!isDone ? (
            <Button
              type="button"
              className={[
                'rounded-xl cursor-pointer',
                sessionMuted
                  ? 'bg-gray-200 text-gray-600 hover:bg-gray-200'
                  : 'bg-black text-white hover:bg-black/90',
              ].join(' ')}
              onClick={openSession}
              disabled={sessionMuted || updateVisitStatusState.isLoading || loading || hasError}
              title={sessionMuted ? sessionMutedReason : undefined}
            >
              {sessionMuted
                ? 'Session disabled'
                : updateVisitStatusState.isLoading
                  ? 'Starting…'
                  : status === 'IN_PROGRESS'
                    ? 'Continue Session'
                    : 'Start Session'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {isOffline ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-2 w-2 rounded-full bg-amber-500" />
            <div className="min-w-0">
              <div className="font-semibold">Offline visit</div>
              <div className="mt-0.5 text-xs text-amber-700">
                Doctor session actions are disabled for offline visits. You can view the summary and
                history below.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {hasError ? (
        <Card className="rounded-2xl border bg-white p-6">
          <div className="text-sm text-red-600">Failed to load visit/patient.</div>
        </Card>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-5 rounded-2xl border bg-white p-6">
            <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
            <div className="mt-4 space-y-2">
              <div className="h-3 w-64 animate-pulse rounded bg-gray-100" />
              <div className="h-3 w-56 animate-pulse rounded bg-gray-100" />
              <div className="h-3 w-52 animate-pulse rounded bg-gray-100" />
            </div>
          </Card>
          <Card className="lg:col-span-7 rounded-2xl border bg-white p-6">
            <div className="h-4 w-56 animate-pulse rounded bg-gray-100" />
            <div className="mt-4 h-60 animate-pulse rounded-xl bg-gray-50" />
          </Card>
        </div>
      ) : isDone ? (
        <DoctorVisitDoneView
          visitId={visitId}
          patientId={patientId}
          patient={patient}
          visit={visit as Visit}
          doctorName={doctorLabel}
          doctorRegdLabel={doctorRegdLabel}
          visitDate={visitDate}
          visitDateLabel={visitDateLabel}
          opdNo={opdNo}
          rxLatest={rxLatest}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-5 rounded-2xl border bg-white p-6">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-gray-700" />
              <div className="text-sm font-semibold text-gray-900">Visit Overview</div>
            </div>

            <div className="mt-4 grid gap-3 text-sm text-gray-800">
              <div className="flex justify-between gap-3">
                <div className="text-gray-600">Patient</div>
                <div className="font-semibold text-gray-900">
                  {String(getProp(patient, 'name') ?? '—')}
                </div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">Phone</div>
                <div className="font-semibold text-gray-900">
                  {String(getProp(patient, 'phone') ?? '—')}
                </div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">Age/Sex</div>
                <div className="font-semibold text-gray-900">
                  {typeof patientAge === 'number' ? String(patientAge) : '—'}/{patientSex ?? '—'}
                </div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">SD-ID</div>
                <div className="font-semibold text-gray-900">
                  {String(getProp(patient, 'sdId') ?? '—')}
                </div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">OPD No</div>
                <div className="font-semibold text-gray-900">{opdNo ?? '—'}</div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">Visit Date</div>
                <div className="font-semibold text-gray-900">{visitDate ?? '—'}</div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">Reason</div>
                <div className="font-semibold text-gray-900">
                  {String(getProp(visit, 'reason') ?? '—')}
                </div>
              </div>

              <div className="flex justify-between gap-3">
                <div className="text-gray-600">Assistant</div>
                <div className="font-semibold text-gray-900">
                  {assistantLabelForUI ??
                    (pendingAssistantLabel ? `${pendingAssistantLabel} (selected)` : '—')}
                </div>
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-7 rounded-2xl border bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">Prescription</div>
                <div className="mt-1 text-xs text-gray-500">
                  Prescription preview and X-rays become visible only after the visit is marked as{' '}
                  <b>DONE</b>.
                </div>
              </div>

              <Badge
                variant="outline"
                className={`rounded-full px-4 py-1 text-xs font-semibold ${stageBadgeClass(status)}`}
              >
                {stageLabel(status)}
              </Badge>
            </div>

            <div className="mt-4 rounded-2xl border p-4">
              <div className="text-xs font-semibold text-gray-700">What’s next</div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-gray-600">
                <li>Add medicines to Rx</li>
                <li>Upload and review X-rays</li>
                <li>Finalize and mark visit as DONE</li>
              </ul>
            </div>

            {/* Assistant select (optional) */}
            {canChooseAssistant ? (
              <div className="min-w-[210px]">
                <Select
                  value={storedAssistantId ?? selectedAssistantId}
                  onValueChange={(v) => {
                    if (storedAssistantId) {
                      toast.info('Assistant already assigned for this visit.');
                      return;
                    }
                    setSelectedAssistantId(v === '__none__' ? '' : v);
                  }}
                  disabled={
                    Boolean(storedAssistantId) ||
                    assistantsQuery.isLoading ||
                    assistantsQuery.isFetching ||
                    sessionMuted
                  }
                >
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue placeholder="Assistant (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No assistant</SelectItem>
                    {activeAssistants.length ? (
                      activeAssistants.map((a) => (
                        <SelectItem key={a.assistantId} value={a.assistantId}>
                          {a.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="__none__" disabled>
                        No assistants available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </Card>
        </div>
      )}
    </section>
  );
}
