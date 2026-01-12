// apps/web/components/visits/RegisterVisitModal.tsx
'use client';

import * as React from 'react';
import { toast } from 'react-toastify';
import { useForm, type SubmitErrorHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { VisitCreate as VisitCreateSchema, type VisitCreate, type VisitTag } from '@dcm/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/src/hooks/useAuth';
import {
  useGetPatientByIdQuery,
  useGetPatientVisitsQuery,
  useCreateVisitMutation,
} from '@/src/store/api';
import { loadPrintSettings } from '@/src/lib/printing/settings';
import { buildTokenEscPos } from '@/src/lib/printing/escpos';
import { printRaw } from '@/src/lib/printing/qz';
import { CLINIC_TZ } from '@/src/lib/clinicTime';

type Props = {
  patientId: string;
  onClose: () => void;
};

const formatClinicDateFromAny = (input: unknown) => {
  const d = input instanceof Date ? input : new Date(String(input));
  if (!Number.isFinite(d.getTime())) return '—';

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
};

type VisitSummaryItem = {
  visitId: string;
  visitDate?: string;
  createdAt?: number;
  opdNo?: string;
  tag?: string;
  reason?: string; // ✅ add reason for label
};

type PatientVisitsResponse = {
  items?: VisitSummaryItem[];
};

function safeVisitLabel(v: VisitSummaryItem) {
  const date = v.visitDate ? String(v.visitDate) : '—';

  const reason = String(v.reason ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (reason) return `${date} • ${reason}`;

  // fallback (if backend doesn't send reason yet)
  const idShort = v.visitId ? `#${String(v.visitId).slice(0, 8)}` : '';
  const opd = v.opdNo ? String(v.opdNo) : idShort;
  return `${date} • ${opd}`;
}

export default function RegisterVisitModal({ patientId, onClose }: Props) {
  const auth = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = React.useState(false);
  const [closing, setClosing] = React.useState(false);

  React.useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const handleClose = React.useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => onClose(), 180);
  }, [closing, onClose]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  const canUseApi = auth.status === 'authenticated';

  const { data: patient } = useGetPatientByIdQuery(patientId, {
    skip: !patientId || !canUseApi,
  });

  const visitsQuery = useGetPatientVisitsQuery(patientId, {
    skip: !patientId || !canUseApi,
  });

  const [createVisit, { isLoading }] = useCreateVisitMutation();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<VisitCreate>({
    resolver: zodResolver(VisitCreateSchema),
    mode: 'onBlur',
    defaultValues: {
      patientId,
      reason: '',
      tag: 'N',
      zeroBilled: false,
      anchorVisitId: undefined,
      isOffline: false,
    },
  });

  React.useEffect(() => {
    setValue('patientId', patientId, { shouldDirty: false, shouldValidate: false });
  }, [patientId, setValue]);

  const selectedTag = watch('tag');
  const zeroBilled = watch('zeroBilled');
  const isOffline = watch('isOffline');

  const anchorCandidates = React.useMemo(() => {
    const data = visitsQuery.data as unknown as PatientVisitsResponse | undefined;
    const items = data?.items;
    const list = Array.isArray(items) ? items : [];

    return list
      .filter((v) => v && v.visitId && v.tag === 'N')
      .slice()
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }, [visitsQuery.data]);

  React.useEffect(() => {
    if (selectedTag !== 'F') {
      setValue('anchorVisitId', undefined, { shouldDirty: true, shouldValidate: true });
      return;
    }

    const current = watch('anchorVisitId');
    if (current) return;

    const latest = anchorCandidates[0]?.visitId;
    if (latest) {
      setValue('anchorVisitId', latest, { shouldDirty: true, shouldValidate: true });
    }
  }, [selectedTag, anchorCandidates, setValue, watch]);

  const onSubmit = async (values: VisitCreate) => {
    if (!canUseApi) {
      toast.error('Please login to create a visit.');
      return;
    }

    if (values.tag === 'F' && !values.anchorVisitId) {
      toast.error('Please select the New (N) visit this follow-up refers to.');
      return;
    }

    try {
      const resp = await createVisit(values).unwrap();
      toast.success('Visit created successfully.');

      try {
        const settings = loadPrintSettings();
        if (settings.autoPrintToken && settings.printerName) {
          const raw = buildTokenEscPos(resp.tokenPrint);
          await printRaw(settings.printerName, raw);
          toast.success('Token printed.');
        }
      } catch (e) {
        console.error(e);
        toast.error('Visit created, but printing failed. Is QZ Tray running?');
      }

      if (values.isOffline) {
        router.push(`/visits/${resp.visit.visitId}/printing/prescription-blank`);
      }

      handleClose();
    } catch (e) {
      console.error(e);
      toast.error('Unable to create visit. Please try again.');
    }
  };

  const onSubmitError: SubmitErrorHandler<VisitCreate> = (formErrors) => {
    const messages = Object.values(formErrors)
      .map((e) => e?.message)
      .filter((m): m is string => Boolean(m));
    toast.error(messages.length ? messages.join('\n') : 'Please check the fields.');
  };

  const TagType = ['N', 'F'] as const satisfies readonly VisitTag[];

  return (
    <div
      className={[
        'absolute inset-0 z-30 flex items-center justify-center',
        'bg-black/10 backdrop-blur-sm',
        mounted && !closing ? 'opacity-100' : 'opacity-0',
        'transition-opacity duration-200',
      ].join(' ')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={[
          mounted && !closing ? 'scale-100 translate-y-0' : 'scale-[0.98] translate-y-1',
          'transition-transform duration-200 ease-out',
        ].join(' ')}
      >
        <Card className="min-w-120 max-w-xl rounded-2xl border-none bg-white shadow-lg gap-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold text-gray-900">Register Checkup</CardTitle>
          </CardHeader>

          <CardContent className="pt-0">
            <form
              className="grid gap-6"
              onSubmit={handleSubmit(onSubmit, onSubmitError)}
              noValidate
            >
              <div className="grid gap-2 text-sm text-gray-800">
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Name</span>
                  <span className="font-medium">{patient?.name ?? '—'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Regd. Date</span>
                  <span className="font-medium">
                    {patient?.createdAt ? formatClinicDateFromAny(patient.createdAt) : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Contact No</span>
                  <span className="font-medium">{patient?.phone ?? '—'}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-800">Reason</label>
                <Input
                  placeholder="Enter the reason for this Visit"
                  className={`h-10 rounded-xl text-sm ${
                    errors.reason
                      ? 'border-red-500 focus-visible:ring-red-500'
                      : 'border-gray-200 focus-visible:ring-gray-300'
                  }`}
                  {...register('reason')}
                />
                <p className="h-3 text-xs">&nbsp;</p>
              </div>

              <div className="flex items-center justify-between gap-4 pb-2">
                <div className="flex items-center gap-4">
                  {TagType.map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        value={t}
                        checked={selectedTag === t}
                        onChange={() =>
                          setValue('tag', t, { shouldDirty: true, shouldValidate: true })
                        }
                      />
                      {t}
                    </label>
                  ))}
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={!!zeroBilled}
                    onChange={(e) =>
                      setValue('zeroBilled', e.target.checked, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                  />
                  Zero billed (Z)
                </label>
              </div>

              <div className="flex items-center justify-between gap-4 pb-1">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={!!isOffline}
                    onChange={(e) =>
                      setValue('isOffline', e.target.checked, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                  />
                  Offline Rx (prints blank prescription)
                </label>
              </div>

              {selectedTag === 'F' ? (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-800">
                    Follow-up for New (N) Visit
                  </label>

                  <select
                    className={`h-10 w-full rounded-xl border bg-white px-3 text-sm ${
                      errors.anchorVisitId
                        ? 'border-red-500 focus-visible:ring-red-500'
                        : 'border-gray-200 focus-visible:ring-gray-300'
                    }`}
                    {...register('anchorVisitId')}
                  >
                    {anchorCandidates.length === 0 ? (
                      <option value="">No prior N visits found</option>
                    ) : (
                      <>
                        <option value="">Select an N visit…</option>
                        {anchorCandidates.map((v) => (
                          <option key={v.visitId} value={v.visitId}>
                            {safeVisitLabel(v)}
                          </option>
                        ))}
                      </>
                    )}
                  </select>

                  <p className="h-3 text-xs text-red-600">
                    {errors.anchorVisitId?.message
                      ? String(errors.anchorVisitId.message)
                      : '\u00A0'}
                  </p>
                </div>
              ) : (
                <p className="h-3 text-xs">&nbsp;</p>
              )}

              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 rounded-xl px-4 text-sm"
                  onClick={handleClose}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!canUseApi || isSubmitting || isLoading}
                  className="h-10 rounded-xl bg-black px-6 text-sm font-medium text-white hover:bg-black/90"
                  title={!canUseApi ? 'Please login to create a visit' : undefined}
                >
                  {isSubmitting || isLoading ? 'Creating…' : 'Create Visit'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
