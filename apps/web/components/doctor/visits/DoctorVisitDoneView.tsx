'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import type { Visit } from '@dcm/types';
import type { Prescription } from '@dcm/types';

import { useGetVisitRxQuery } from '@/src/store/api';

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

  // keep same “version selection” behavior you had, but simplified here:
  // (If you need the exact version-selector logic, we can move it in as well.)
  const rxQuery = useGetVisitRxQuery({ visitId });
  const rxToShow = rxQuery.data?.rx ?? (isRecord(rxLatest) ? rxLatest : null);

  const lines = Array.isArray(getProp(rxToShow, 'lines'))
    ? (getProp(rxToShow, 'lines') as any[] as any)
    : [];
  const toothDetails = Array.isArray(getProp(rxToShow, 'toothDetails'))
    ? (getProp(rxToShow, 'toothDetails') as any[] as any)
    : [];

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
            <div className="ml-auto text-xs text-gray-500">{visitDate ? visitDate.trim() : ''}</div>
          </div>

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
              currentVisitId={visitId}
              chainVisitIds={[visitId]}
              visitMetaMap={new Map()}
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

      {/* History is deferred until expanded */}
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
