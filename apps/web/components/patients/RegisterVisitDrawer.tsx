'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGetDoctorsQuery, useCreateVisitMutation } from '@/src/store/api';
import type { VisitCreateResponse } from '@dms/types';
import type { VisitCreate } from '@dms/types';
import { toast } from 'react-toastify';
import { useAuth } from '@/src/hooks/useAuth';

import { loadPrintSettings } from '@/src/lib/printing/settings';
import { buildTokenEscPos } from '@/src/lib/printing/escpos';
import { printRaw } from '@/src/lib/printing/qz';

type Props = {
  patientId: string;
};

export function RegisterVisitDrawer({ patientId }: Props) {
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const [open, setOpen] = React.useState(false);
  const [doctorId, setDoctorId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const { data: doctors, isLoading: doctorsLoading } = useGetDoctorsQuery(undefined, {
    skip: !canUseApi,
  });

  const [createVisit] = useCreateVisitMutation();

  const tryAutoPrint = async (resp: VisitCreateResponse) => {
    const settings = loadPrintSettings();
    if (!settings.autoPrintToken) return;
    if (!settings.printerName) {
      toast.info('Visit created. Select a printer in Settings to auto-print tokens.');
      return;
    }

    const raw = buildTokenEscPos(resp.tokenPrint);
    await printRaw(settings.printerName, raw);
  };

  const handleSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();
    if (!doctorId || !reason.trim()) {
      toast.error('Please select a doctor and enter a reason.');
      return;
    }

    const payload: VisitCreate = {
      patientId,
      doctorId,
      reason: reason.trim(),
      tag: 'N', // drawer flow defaults; modal supports N/F/Z
    };

    try {
      setSubmitting(true);
      const resp = await createVisit(payload).unwrap();
      toast.success('Visit registered and added to the queue.');

      try {
        await tryAutoPrint(resp);
        toast.success('Token printed.');
      } catch (err) {
        console.error(err);
        toast.error('Visit created, but printing failed. Is QZ Tray running?');
      }

      setOpen(false);
      setReason('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to register visit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-2">
      <Button
        type="button"
        size="sm"
        className="rounded-full bg-black text-xs font-medium text-white hover:bg-black/90"
        onClick={() => setOpen(true)}
        disabled={!canUseApi}
      >
        Register checkup
      </Button>

      {open && (
        <div className="mt-3 rounded-2xl border bg-gray-50 p-3">
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="space-y-1 text-xs">
              <label className="block text-gray-600" htmlFor="doctor">
                Select doctor
              </label>
              <select
                id="doctor"
                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-black"
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                disabled={doctorsLoading || !canUseApi}
              >
                <option value="">Choose doctor…</option>
                {doctors?.map((d) => (
                  <option key={d.doctorId} value={d.doctorId}>
                    {d.fullName || d.displayName || d.doctorId}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1 text-xs">
              <label className="block text-gray-600" htmlFor="reason">
                Reason for visit
              </label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Tooth pain, cleaning, follow-up..."
                className="h-8 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full text-xs"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="rounded-full bg-black text-xs text-white hover:bg-black/90"
                disabled={submitting}
              >
                {submitting ? 'Registering…' : 'Register'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
