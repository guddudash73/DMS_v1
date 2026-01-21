'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import type { Visit } from '@dcm/types';

import { useGetVisitRxQuery, useGetPatientVisitsQuery } from '@/src/store/api';

import { ClipboardList, Image as ImageIcon } from 'lucide-react';
import type { VisitPrescriptionQuickLookDialogProps } from './dialogs/VisitPrescriptionQuickLookDialog';

const PrescriptionPreview = dynamic(
  () => import('@/components/prescription/PrescriptionPreview').then((m) => m.PrescriptionPreview),
  { ssr: false },
);

const XrayTrayReadOnly = dynamic(
  () => import('@/components/xray/XrayTrayReadOnly').then((m) => m.XrayTrayReadOnly),
  { ssr: false },
);

const DoctorVisitHistoryPanel = dynamic(
  () => import('./DoctorVisitHistoryPanel').then((m) => m.DoctorVisitHistoryPanel),
  {
    ssr: false,
    loading: () => (
      <Card className="mt-4 w-full rounded-2xl border bg-white p-4">
        <div className="h-5 w-40 animate-pulse rounded bg-gray-100" />
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-gray-50" />
      </Card>
    ),
  },
);

const VisitPrescriptionQuickLookDialog = dynamic<VisitPrescriptionQuickLookDialogProps>(
  () =>
    import('./dialogs/VisitPrescriptionQuickLookDialog').then(
      (m) => m.VisitPrescriptionQuickLookDialog,
    ),
  { ssr: false },
);

const VisitXrayQuickLookDialog = dynamic(
  () => import('./dialogs/VisitXrayQuickLookDialog').then((m) => m.VisitXrayQuickLookDialog),
  { ssr: false },
);

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

function anchorIdFromVisit(v: Visit): string | undefined {
  return getPropString(v as unknown, 'anchorVisitId') ?? getPropString(v as unknown, 'anchorId');
}

export function DoctorVisitDoneView(props: {
  visitId: string;
  patientId: string;
  patient: unknown;
  visit: Visit;
  doctorName?: string;
  doctorRegdLabel?: string;
  visitDate?: string;
  visitDateLabel?: string;
  opdNo?: string;
  rxLatest: unknown;
}) {
  const router = useRouter();
  const {
    visitId,
    patientId,
    patient,
    visit,
    doctorName,
    doctorRegdLabel,
    visitDate,
    visitDateLabel,
    opdNo,
    rxLatest,
  } = props;

  // ✅ Toggle ONLY for prescription chain history (same pattern as Clinic page)
  const [showHistory, setShowHistory] = React.useState(false);

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

  // Rx (still fetch current visit RX)
  const rxQuery = useGetVisitRxQuery({ visitId });
  const rxToShow = rxQuery.data?.rx ?? (isRecord(rxLatest) ? rxLatest : null);

  const lines = Array.isArray(getProp(rxToShow, 'lines'))
    ? (getProp(rxToShow, 'lines') as any[])
    : [];
  const toothDetails = Array.isArray(getProp(rxToShow, 'toothDetails'))
    ? (getProp(rxToShow, 'toothDetails') as any[])
    : [];

  // ✅ Build chain only when toggle is ON; otherwise keep it light (current visit only)
  const rxChain = React.useMemo(() => {
    const meta = new Map<string, Visit>();
    if (visit?.visitId) meta.set(visit.visitId, visit);

    if (!showHistory) {
      return { visitIds: [visitId], meta, currentVisitId: visitId };
    }

    for (const v of allVisitsRaw) {
      if (v?.visitId) meta.set(v.visitId, v);
    }
    if (visit?.visitId) meta.set(visit.visitId, visit);

    const tag = getPropString(visit as unknown, 'tag');
    const anchorVisitId = getPropString(visit as unknown, 'anchorVisitId');

    // If followup tag 'F', anchor is anchorVisitId; else current visit
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

    // Limit chain up to current visit (inclusive)
    const idx = chainIdsOrdered.indexOf(visitId);
    const limitedIds = idx >= 0 ? chainIdsOrdered.slice(0, idx + 1) : [visitId];

    return { visitIds: limitedIds, meta, currentVisitId: visitId };
  }, [allVisitsRaw, showHistory, visit, visitId]);

  const historyLoading = showHistory && (visitsQuery.isLoading || visitsQuery.isFetching);

  // Quick look dialogs (opened from history panel)
  const [rxQuickOpen, setRxQuickOpen] = React.useState(false);
  const [xrayQuickOpen, setXrayQuickOpen] = React.useState(false);
  const [quickVisitId, setQuickVisitId] = React.useState<string | null>(null);

  const openRxQuick = (id: string) => {
    setQuickVisitId(id);
    setRxQuickOpen(true);
  };
  const openXrayQuick = (id: string) => {
    setQuickVisitId(id);
    setXrayQuickOpen(true);
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-6 rounded-2xl border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-gray-700" />
            <div className="text-sm font-semibold text-gray-900">Prescription</div>

            {/* ✅ Toggle added here, minimal UI impact */}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                className={[
                  'rounded-full px-3 py-1 text-[11px] font-medium transition',
                  showHistory
                    ? 'bg-black text-white hover:bg-black/90'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200',
                ].join(' ')}
                onClick={() => setShowHistory((v) => !v)}
                title="Toggle previous visit history in prescription"
              >
                {showHistory ? 'Hide history' : 'Show history'}
              </button>

              <div className="text-xs text-gray-500">{visitDate ? visitDate.trim() : ''}</div>
            </div>
          </div>

          {showHistory ? (
            <div className="mb-3 rounded-xl border bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
              {historyLoading
                ? 'Loading visit history…'
                : `Showing chained visit history (${rxChain.visitIds.length} visit${
                    rxChain.visitIds.length === 1 ? '' : 's'
                  }).`}
            </div>
          ) : null}

          <div className="min-w-0 overflow-x-hidden">
            <PrescriptionPreview
              patientName={getProp(patient, 'name') as any}
              patientPhone={getProp(patient, 'phone') as any}
              patientAge={undefined}
              patientSex={undefined}
              sdId={getProp(patient, 'sdId') as any}
              opdNo={opdNo}
              doctorName={doctorName}
              doctorRegdLabel={doctorRegdLabel}
              visitDateLabel={visitDateLabel}
              lines={lines as any}
              receptionNotes={
                isRecord(rxToShow) ? String(getProp(rxToShow, 'receptionNotes') ?? '') : ''
              }
              toothDetails={toothDetails as any}
              // ✅ ONLY pass chain props when toggle is ON
              currentVisitId={showHistory ? rxChain.currentVisitId : undefined}
              chainVisitIds={showHistory ? rxChain.visitIds : undefined}
              visitMetaMap={showHistory ? rxChain.meta : undefined}
            />
          </div>
        </Card>

        <Card className="lg:col-span-6 rounded-2xl border bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-gray-700" />
            <div className="text-sm font-semibold text-gray-900">X-rays</div>
            <div className="ml-auto text-xs text-gray-500">All images for this visit</div>
          </div>

          <div className="min-h-60">
            <XrayTrayReadOnly visitId={visitId} />
          </div>
        </Card>
      </div>

      {/* History panel remains as-is (no UI change requested) */}
      <DoctorVisitHistoryPanel
        patientId={patientId}
        onOpenVisit={(vId) => router.push(`/doctor/visits/${vId}`)}
        onOpenRxQuick={openRxQuick}
        onOpenXrayQuick={openXrayQuick}
      />

      <VisitPrescriptionQuickLookDialog
        open={rxQuickOpen}
        onOpenChange={setRxQuickOpen}
        visitId={quickVisitId}
        patientId={patientId}
        patientName={
          typeof getProp(patient, 'name') === 'string'
            ? (getProp(patient, 'name') as string)
            : undefined
        }
        patientPhone={
          typeof getProp(patient, 'phone') === 'string'
            ? (getProp(patient, 'phone') as string)
            : undefined
        }
        patientSdId={
          typeof getProp(patient, 'sdId') === 'string'
            ? (getProp(patient, 'sdId') as string)
            : undefined
        }
        opdNo={opdNo}
        doctorName={doctorName}
        doctorRegdLabel={doctorRegdLabel}
      />

      <VisitXrayQuickLookDialog
        open={xrayQuickOpen}
        onOpenChange={setXrayQuickOpen}
        visitId={quickVisitId}
      />
    </>
  );
}
