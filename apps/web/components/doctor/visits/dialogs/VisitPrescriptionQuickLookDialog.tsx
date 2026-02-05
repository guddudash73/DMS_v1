'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useGetVisitRxQuery,
  useGetVisitByIdQuery,
  useGetPatientByIdQuery,
  useGetPatientVisitsQuery,
} from '@/src/store/api';
import { clinicDateISO } from '@/src/lib/clinicTime';

import type { Visit, ToothDetail } from '@dcm/types';

const PrescriptionPreview = dynamic(
  () => import('@/components/prescription/PrescriptionPreview').then((m) => m.PrescriptionPreview),
  { ssr: false },
);

type PatientSex = 'M' | 'F' | 'O' | 'U';
type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function getProp(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) return undefined;
  return obj[key];
}

function getString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

function getNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function getPropString(obj: unknown, key: string): string | undefined {
  return getString(getProp(obj, key));
}

function getPropNumber(obj: unknown, key: string): number | undefined {
  return getNumber(getProp(obj, key));
}

function safeParseDate(input: unknown): Date | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input as any);
  return Number.isFinite(d.getTime()) ? d : null;
}

function getVisitTimeMs(v: unknown): number {
  const n =
    getPropNumber(v, 'createdAt') ??
    getPropNumber(v, 'updatedAt') ??
    getPropNumber(v, 'created_at') ??
    getPropNumber(v, 'updated_at');

  if (typeof n === 'number' && Number.isFinite(n) && n > 0) return n;

  const s =
    getPropString(v, 'createdAt') ??
    getPropString(v, 'updatedAt') ??
    getPropString(v, 'created_at') ??
    getPropString(v, 'updated_at');

  const d = s ? safeParseDate(s) : null;
  return d ? d.getTime() : 0;
}

function formatPatientRegdDate(patient: unknown): string {
  const createdAtNum =
    getPropNumber(patient, 'createdAt') ??
    getPropNumber(patient, 'created_at') ??
    getPropNumber(patient, 'registeredAt') ??
    getPropNumber(patient, 'regdAt');

  if (typeof createdAtNum === 'number' && Number.isFinite(createdAtNum) && createdAtNum > 0) {
    return new Date(createdAtNum).toLocaleDateString('en-GB');
  }

  const createdAtStr =
    getPropString(patient, 'createdAt') ??
    getPropString(patient, 'created_at') ??
    getPropString(patient, 'registeredAt') ??
    getPropString(patient, 'regdAt');

  if (createdAtStr) {
    const d = new Date(createdAtStr);
    if (Number.isFinite(d.getTime())) return d.toLocaleDateString('en-GB');
  }

  return '—';
}

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

function anchorIdFromVisit(v: Visit): string | undefined {
  return getPropString(v, 'anchorVisitId') ?? getPropString(v, 'anchorId') ?? undefined;
}

export type VisitPrescriptionQuickLookDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitId: string | null;

  patientId?: string;
  patientName?: string;
  patientPhone?: string;
  patientSdId?: string;

  opdNo?: string;
  doctorName?: string;
  doctorRegdLabel?: string;
};

export function VisitPrescriptionQuickLookDialog(props: VisitPrescriptionQuickLookDialogProps) {
  const {
    open,
    onOpenChange,
    visitId,
    patientId,
    patientName,
    patientPhone,
    patientSdId,
    opdNo,
    doctorName,
    doctorRegdLabel,
  } = props;

  /**
   * ✅ Critical fix for dialog:
   * Radix Dialog often mounts content before it is visually “painted”.
   * PrescriptionPreview measures header/footer via offsetHeight; if measured while hidden,
   * footerH stays too small → content overlaps footer.
   *
   * We:
   * 1) wait for 2 RAFs after open to ensure the dialog is painted
   * 2) then mount the preview (so measurements are correct)
   * 3) also force remount per open/visitId change
   */
  const [openNonce, setOpenNonce] = React.useState(0);
  const [previewReady, setPreviewReady] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setPreviewReady(false);
      return;
    }

    setOpenNonce((n) => n + 1);

    let raf1 = 0;
    let raf2 = 0;
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => setPreviewReady(true));
    });

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [open, visitId]);

  const rxQuery = useGetVisitRxQuery({ visitId: visitId ?? '' }, { skip: !open || !visitId });
  const visitQuery = useGetVisitByIdQuery(visitId ?? '', { skip: !open || !visitId });
  const patientQuery = useGetPatientByIdQuery(patientId ?? '', { skip: !open || !patientId });

  const visitsQuery = useGetPatientVisitsQuery(patientId ?? '', {
    skip: !open || !patientId,
    refetchOnMountOrArgChange: true,
  });

  const allVisitsRaw = React.useMemo(() => {
    const items = getProp(visitsQuery.data, 'items');
    return Array.isArray(items) ? (items as Visit[]) : [];
  }, [visitsQuery.data]);

  const visitCreatedAtDate = React.useMemo(() => {
    const createdAt =
      getProp(visitQuery.data, 'createdAt') ?? getProp(visitQuery.data, 'updatedAt');
    return safeParseDate(createdAt);
  }, [visitQuery.data]);

  const visitDateLabelComputed = React.useMemo(() => {
    const ms = visitCreatedAtDate?.getTime();
    return ms ? `Visit: ${clinicDateISO(new Date(ms))}` : '';
  }, [visitCreatedAtDate]);

  const patientSex = React.useMemo<PatientSex | undefined>(() => {
    const raw =
      getProp(patientQuery.data, 'gender') ??
      getProp(patientQuery.data, 'sex') ??
      getProp(patientQuery.data, 'patientSex') ??
      undefined;

    return normalizeSex(raw);
  }, [patientQuery.data]);

  const patientAge = React.useMemo<number | undefined>(() => {
    const dobRaw =
      getProp(patientQuery.data, 'dob') ??
      getProp(patientQuery.data, 'dateOfBirth') ??
      getProp(patientQuery.data, 'birthDate') ??
      getProp(patientQuery.data, 'dobIso') ??
      null;

    const dob = safeParseDobToDate(dobRaw);
    const at = visitCreatedAtDate ?? new Date();
    const ageFromDob = dob ? calculateAge(dob, at) : undefined;

    const ageStoredRaw = getProp(patientQuery.data, 'age');
    const ageStored =
      typeof ageStoredRaw === 'number' && Number.isFinite(ageStoredRaw) ? ageStoredRaw : undefined;

    return ageFromDob ?? ageStored;
  }, [patientQuery.data, visitCreatedAtDate]);

  const patientRegdDate = React.useMemo(() => {
    return formatPatientRegdDate(patientQuery.data);
  }, [patientQuery.data]);

  const rxUnknown = getProp(rxQuery.data, 'rx');

  const currentLinesUnknown = isRecord(rxUnknown) ? getProp(rxUnknown, 'lines') : undefined;
  const currentLines = Array.isArray(currentLinesUnknown) ? currentLinesUnknown : [];

  const currentToothDetails = React.useMemo<ToothDetail[]>(() => {
    if (!rxUnknown || !isRecord(rxUnknown)) return [];
    const td = getProp(rxUnknown, 'toothDetails');
    return Array.isArray(td) ? (td as ToothDetail[]) : [];
  }, [rxUnknown]);

  const doctorNotes = React.useMemo<string>(() => {
    if (!rxUnknown || !isRecord(rxUnknown)) return '';
    const dn = getProp(rxUnknown, 'doctorNotes');
    return dn == null ? '' : String(dn);
  }, [rxUnknown]);

  const receptionNotes = React.useMemo<string>(() => {
    if (!rxUnknown || !isRecord(rxUnknown)) return '';
    const rn = getProp(rxUnknown, 'receptionNotes');
    return rn == null ? '' : String(rn);
  }, [rxUnknown]);

  const rxChain = React.useMemo(() => {
    const selectedId = visitId ?? '';
    const meta = new Map<string, Visit>();

    for (const v of allVisitsRaw) {
      if (v?.visitId) meta.set(v.visitId, v);
    }

    const vd = visitQuery.data;
    const vdId = getPropString(vd, 'visitId');
    if (vdId) meta.set(vdId, vd as unknown as Visit);

    const vSelected = meta.get(selectedId) ?? (vd as unknown as Visit | undefined);

    const tag = getPropString(vSelected, 'tag');
    const anchorVisitId = getPropString(vSelected, 'anchorVisitId');

    const anchorId = tag === 'F' ? anchorVisitId : selectedId;
    if (!anchorId) {
      return { visitIds: selectedId ? [selectedId] : [], meta, currentVisitId: selectedId };
    }

    const chain: Visit[] = [];

    const anchor = meta.get(anchorId);
    if (anchor) chain.push(anchor);

    const followups: Visit[] = [];
    for (const v of meta.values()) {
      const aId = anchorIdFromVisit(v);
      if (aId && aId === anchorId && v.visitId !== anchorId) followups.push(v);
    }

    followups.sort((a, b) => getVisitTimeMs(a) - getVisitTimeMs(b));
    chain.push(...followups);

    if (selectedId && !chain.some((x) => x.visitId === selectedId)) {
      const cur = meta.get(selectedId);
      chain.push(cur ?? ({ visitId: selectedId } as Visit));
    }

    chain.sort((a, b) => getVisitTimeMs(a) - getVisitTimeMs(b));

    const seen = new Set<string>();
    const chainIdsOrdered = chain
      .map((x) => x.visitId)
      .filter((id) => {
        if (!id) return false;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

    const idx = selectedId ? chainIdsOrdered.indexOf(selectedId) : -1;
    const limitedIds = idx >= 0 ? chainIdsOrdered.slice(0, idx + 1) : chainIdsOrdered;

    return { visitIds: limitedIds, meta, currentVisitId: selectedId };
  }, [allVisitsRaw, visitId, visitQuery.data]);

  const selectedVisitOpdNo = React.useMemo(() => {
    const raw =
      getProp(visitQuery.data, 'opdNo') ??
      getProp(visitQuery.data, 'opdNumber') ??
      getProp(visitQuery.data, 'opdId') ??
      getProp(visitQuery.data, 'opd') ??
      getProp(visitQuery.data, 'opd_no') ??
      getProp(visitQuery.data, 'opd_no_str') ??
      undefined;

    const s = raw == null ? '' : String(raw).trim();
    return s || undefined;
  }, [visitQuery.data]);

  type PreviewProps = React.ComponentProps<typeof PrescriptionPreview>;

  const loading = rxQuery.isFetching || visitQuery.isFetching || patientQuery.isFetching;
  const previewKey = `rxql:${visitId ?? 'none'}:${openNonce}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl rounded-2xl">
        <DialogHeader>
          <DialogTitle>Prescription</DialogTitle>
        </DialogHeader>

        <div className="max-h-[78vh] min-h-105 w-full overflow-auto">
          <div className="mx-auto w-full rounded-2xl border bg-white p-4">
            {loading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : !visitId ? (
              <div className="text-sm text-gray-500">Invalid visit.</div>
            ) : !previewReady ? (
              <div className="text-sm text-gray-500">Preparing preview…</div>
            ) : (
              <div key={previewKey} className="rx-preview-shell min-w-0 overflow-x-hidden">
                <PrescriptionPreview
                  patientName={
                    (getProp(patientQuery.data, 'name') as PreviewProps['patientName']) ??
                    patientName
                  }
                  patientPhone={
                    (getProp(patientQuery.data, 'phone') as PreviewProps['patientPhone']) ??
                    patientPhone
                  }
                  patientAge={patientAge}
                  patientSex={patientSex}
                  sdId={(getProp(patientQuery.data, 'sdId') as string | undefined) ?? patientSdId}
                  opdNo={selectedVisitOpdNo ?? opdNo}
                  doctorName={doctorName}
                  doctorRegdLabel={doctorRegdLabel}
                  visitDateLabel={visitDateLabelComputed}
                  regdDate={patientRegdDate}
                  lines={currentLines as PreviewProps['lines']}
                  toothDetails={currentToothDetails}
                  doctorNotes={doctorNotes}
                  receptionNotes={receptionNotes}
                  currentVisitId={rxChain.currentVisitId}
                  chainVisitIds={rxChain.visitIds}
                  visitMetaMap={rxChain.meta}
                />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
