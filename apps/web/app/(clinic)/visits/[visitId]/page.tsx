'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
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
} from '@/src/store/api';

export default function ClinicVisitInfoPage() {
  const params = useParams<{ visitId: string }>();
  const visitId = String(params?.visitId ?? '');

  const visitQuery = useGetVisitByIdQuery(visitId, { skip: !visitId });
  const patientId = visitQuery.data?.patientId;

  const patientQuery = useGetPatientByIdQuery(patientId ?? '', { skip: !patientId });

  const rxQuery = useGetVisitRxQuery({ visitId }, { skip: !visitId });

  const xraysQuery = useListVisitXraysQuery({ visitId }, { skip: !visitId });
  const xrayIds = (xraysQuery.data?.items ?? []).map((x) => x.xrayId);

  const [updateNotes, updateNotesState] = useUpdateVisitRxReceptionNotesMutation();

  const rx = rxQuery.data?.rx ?? null;

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
    } catch (err: any) {
      toast.error(err?.data?.message ?? err?.message ?? 'Failed to save notes.');
    }
  };

  const patientName = patientQuery.data?.name;
  const patientPhone = patientQuery.data?.phone;

  const doctorLabel = visitQuery.data?.doctorId ? `Doctor (${visitQuery.data.doctorId})` : 'Doctor';

  const visitDateLabel = visitQuery.data?.visitDate
    ? `Visit: ${visitQuery.data.visitDate}`
    : undefined;

  // ✅ print helper (prevents conflict with XrayPrintSheet)
  const printPrescription = () => {
    if (!rx) return;

    const onAfterPrint = () => {
      document.body.classList.remove('print-rx');
      window.removeEventListener('afterprint', onAfterPrint);
    };

    window.addEventListener('afterprint', onAfterPrint);

    document.body.classList.add('print-rx');

    // allow DOM/styles to settle
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  };

  return (
    <section className="p-4 2xl:p-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-gray-900">Visit Info</div>
          <div className="text-xs text-gray-500">{visitId ? `Visit ID: ${visitId}` : ''}</div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={printPrescription}
            disabled={!rx}
            title={!rx ? 'No prescription available to print' : 'Print prescription'}
          >
            Print Prescription
          </Button>

          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => {
              if (xrayIds.length === 0) {
                toast.info('No X-rays to print.');
                return;
              }
              setXrayPrintOpen(true);
            }}
          >
            Print X-rays
          </Button>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-10">
        <div className="lg:col-span-6 rounded-2xl bg-white p-4 border">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-lg font-semibold text-gray-900">Prescription</div>
            <div className="text-xs text-gray-500">
              {rxQuery.isLoading ? 'Loading…' : rx ? 'Ready' : 'No prescription'}
            </div>
          </div>

          <div className="min-w-0 overflow-hidden">
            <PrescriptionPreview
              patientName={patientName}
              patientPhone={patientPhone}
              doctorName={doctorLabel}
              visitDateLabel={visitDateLabel}
              lines={rx?.lines ?? []}
              receptionNotes={notes}
            />
          </div>

          <PrescriptionPrintSheet
            patientName={patientName}
            patientPhone={patientPhone}
            doctorName={doctorLabel}
            visitDateLabel={visitDateLabel}
            lines={rx?.lines ?? []}
            receptionNotes={notes}
          />
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

      <XrayPrintSheet
        open={xrayPrintOpen}
        xrayIds={xrayIds}
        onAfterPrint={() => setXrayPrintOpen(false)}
      />
    </section>
  );
}
