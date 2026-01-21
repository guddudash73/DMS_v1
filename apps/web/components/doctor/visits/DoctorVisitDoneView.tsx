'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

import type { Visit } from '@dcm/types';
import { useGetVisitRxQuery } from '@/src/store/api';

import { ClipboardList, Image as ImageIcon, History } from 'lucide-react';
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
    doctorName,
    doctorRegdLabel,
    visitDate,
    visitDateLabel,
    opdNo,
    rxLatest,
  } = props;

  // Rx selection: prefer fresh query, fall back to rxLatest
  const rxQuery = useGetVisitRxQuery({ visitId });
  const rxToShow = rxQuery.data?.rx ?? (isRecord(rxLatest) ? rxLatest : null);

  const lines = Array.isArray(getProp(rxToShow, 'lines'))
    ? (getProp(rxToShow, 'lines') as any[])
    : [];
  const toothDetails = Array.isArray(getProp(rxToShow, 'toothDetails'))
    ? (getProp(rxToShow, 'toothDetails') as any[])
    : [];

  // ✅ Toggle: show/hide history (mount cost)
  const [showHistory, setShowHistory] = React.useState(true);

  // ✅ Toggle: switch between Prescription and X-rays (tabs)
  const [pane, setPane] = React.useState<'rx' | 'xray'>('rx');

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
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <History className="h-4 w-4" />
          <span className="font-medium text-gray-900">Done Summary</span>
          <span className="text-gray-400">·</span>
          <span>{visitDate ? visitDate.trim() : ''}</span>
        </div>

        <div className="flex items-center gap-2 self-end rounded-xl border bg-white px-3 py-2">
          <Switch id="toggle-history" checked={showHistory} onCheckedChange={setShowHistory} />
          <Label htmlFor="toggle-history" className="text-xs text-gray-700">
            Show history
          </Label>
        </div>
      </div>

      <Tabs value={pane} onValueChange={(v) => setPane(v === 'xray' ? 'xray' : 'rx')}>
        <TabsList className="mb-3">
          <TabsTrigger value="rx" className="text-xs">
            Prescription
          </TabsTrigger>
          <TabsTrigger value="xray" className="text-xs">
            X-rays
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rx">
          <Card className="rounded-2xl border bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-gray-700" />
              <div className="text-sm font-semibold text-gray-900">Prescription</div>
              <div className="ml-auto text-xs text-gray-500">
                {visitDate ? visitDate.trim() : ''}
              </div>
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
        </TabsContent>

        <TabsContent value="xray">
          <Card className="rounded-2xl border bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-gray-700" />
              <div className="text-sm font-semibold text-gray-900">X-rays</div>
              <div className="ml-auto text-xs text-gray-500">All images for this visit</div>
            </div>

            <div className="min-h-60">
              <XrayTrayReadOnly visitId={visitId} />
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ✅ History is mounted only if toggle is ON */}
      {showHistory ? (
        <>
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
      ) : null}
    </>
  );
}
