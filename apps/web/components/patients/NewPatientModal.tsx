'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitErrorHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';

import { PatientCreate as PatientCreateSchema } from '@dms/types';
import type { PatientCreate } from '@dms/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { useCreatePatientMutation, type ErrorResponse } from '@/src/store/api';

type Props = {
  onClose: () => void;
};

type ApiError = {
  status?: number;
  data?: unknown;
};

type PatientCreateInput = z.input<typeof PatientCreateSchema>;

const asErrorResponse = (data: unknown): ErrorResponse | null => {
  if (!data || typeof data !== 'object') return null;
  const maybe = data as Partial<ErrorResponse>;
  if (typeof maybe.error === 'string') {
    return {
      error: maybe.error,
      message: typeof maybe.message === 'string' ? maybe.message : undefined,
      fieldErrors:
        maybe.fieldErrors && typeof maybe.fieldErrors === 'object'
          ? (maybe.fieldErrors as Record<string, string[]>)
          : undefined,
      traceId: typeof maybe.traceId === 'string' ? maybe.traceId : undefined,
    };
  }
  return null;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

// Store DOB as YYYY-MM-DD (avoids timezone drift)
const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const fromIsoDate = (iso: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const d = new Date(y, mo - 1, da);
  return Number.isFinite(d.getTime()) ? d : null;
};

export default function NewPatientModal({ onClose }: Props) {
  const router = useRouter();
  const [createPatient, { isLoading }] = useCreatePatientMutation();

  const [mounted, setMounted] = React.useState(false);
  const [closing, setClosing] = React.useState(false);

  React.useEffect(() => {
    const r = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(r);
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(PatientCreateSchema),
    mode: 'onBlur',
  });

  const dobValue = watch('dob') as unknown as string | undefined;
  const selectedDob = dobValue ? fromIsoDate(dobValue) : null;

  // Control popover so we can close it ONLY when we want (onSelect)
  const [dobOpen, setDobOpen] = React.useState(false);

  const currentYear = new Date().getFullYear();

  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => onClose(), 180);
  };

  const onSubmit = async (values: PatientCreate) => {
    try {
      const patient = await createPatient(values).unwrap();
      toast.success('Patient created successfully.');
      handleClose();
      router.push(`/patients/${patient.patientId}`);
    } catch (err) {
      const e = err as ApiError;
      const maybe = asErrorResponse(e.data);

      toast.error(
        maybe?.message ??
          (e.status === 409
            ? 'A patient already exists with this name and phone.'
            : 'Unable to save patient. Please try again.'),
      );
    }
  };

  const onSubmitError: SubmitErrorHandler<PatientCreateInput> = (formErrors) => {
    const messages = Object.values(formErrors)
      .map((e) => e?.message)
      .filter((m): m is string => Boolean(m));

    toast.error(messages.length ? messages.join('\n') : 'Please check the highlighted fields.');
  };

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
            <CardTitle className="text-xl font-semibold text-gray-900">Create Patient</CardTitle>
          </CardHeader>

          <CardContent className="pt-0">
            <form
              className="grid gap-6"
              onSubmit={handleSubmit(onSubmit, onSubmitError)}
              noValidate
            >
              <div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-gray-800">Name</Label>
                  <Input
                    className={`h-10 rounded-xl text-sm ${
                      errors.name
                        ? 'border-red-500 focus-visible:ring-red-500'
                        : 'border-gray-200 focus-visible:ring-gray-300'
                    }`}
                    {...register('name')}
                  />
                  <p className="h-3 text-xs text-red-600">
                    {(errors.name?.message as any) ?? '\u00A0'}
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm font-medium text-gray-800">Contact No.</Label>
                  <Input
                    className={`h-10 rounded-xl text-sm ${
                      errors.phone
                        ? 'border-red-500 focus-visible:ring-red-500'
                        : 'border-gray-200 focus-visible:ring-gray-300'
                    }`}
                    {...register('phone')}
                  />
                  <p className="h-3 text-xs text-red-600">
                    {(errors.phone?.message as any) ?? '\u00A0'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-gray-800">Gender</Label>
                    <select
                      {...register('gender')}
                      className={`h-10 w-full rounded-xl border bg-white px-3 text-sm ${
                        errors.gender
                          ? 'border-red-500 focus-visible:ring-red-500'
                          : 'border-gray-200 focus-visible:ring-gray-300'
                      }`}
                    >
                      <option value="">Choose</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                    <p className="h-3 text-xs text-red-600">
                      {(errors.gender?.message as any) ?? '\u00A0'}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-sm font-medium text-gray-800">DOB</Label>

                    <Popover open={dobOpen} onOpenChange={setDobOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={[
                            'h-10 w-full justify-between rounded-xl px-3 text-sm font-normal',
                            'bg-white',
                            errors.dob
                              ? 'border-red-500 focus-visible:ring-red-500'
                              : 'border-gray-200 focus-visible:ring-gray-300',
                            !selectedDob ? 'text-gray-400' : 'text-gray-900',
                          ].join(' ')}
                        >
                          <span className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-gray-500" />
                            {selectedDob ? format(selectedDob, 'dd/MM/yyyy') : 'Pick a date'}
                          </span>
                          <span className="text-gray-500">▾</span>
                        </Button>
                      </PopoverTrigger>

                      <PopoverContent
                        className="w-auto p-2"
                        align="start"
                        // ✅ IMPORTANT: prevents the popover from collapsing when the native <select> dropdown opens
                        onInteractOutside={(e) => e.preventDefault()}
                        onCloseAutoFocus={(e) => e.preventDefault()}
                      >
                        <Calendar
                          mode="single"
                          selected={selectedDob ?? undefined}
                          onSelect={(d) => {
                            if (!d) return;
                            setValue('dob' as any, toIsoDate(d) as any, {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: true,
                            });
                            setDobOpen(false);
                          }}
                          // DOB: disable future dates
                          disabled={(d) => d > new Date()}
                          // ✅ This produces the exact month/year dropdown header like your screenshot
                          captionLayout="dropdown"
                          fromYear={1900}
                          toYear={currentYear}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>

                    <p className="h-3 text-xs text-red-600">
                      {(errors.dob?.message as any) ?? '\u00A0'}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm font-medium text-gray-800">Address</Label>
                  <Textarea
                    className={`min-h-20 rounded-xl text-sm ${
                      errors.address
                        ? 'border-red-500 focus-visible:ring-red-500'
                        : 'border-gray-200 focus-visible:ring-gray-300'
                    }`}
                    {...register('address')}
                  />
                  <p className="h-3 text-xs text-red-600">
                    {(errors.address?.message as any) ?? '\u00A0'}
                  </p>
                </div>
              </div>

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
                  disabled={isSubmitting || isLoading}
                  className="h-10 rounded-xl bg-black px-6 text-sm font-medium text-white hover:bg-black/90"
                >
                  {isSubmitting || isLoading ? 'Creating…' : 'Create Patient'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
