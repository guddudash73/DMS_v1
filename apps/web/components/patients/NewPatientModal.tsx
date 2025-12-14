'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type SubmitErrorHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'react-toastify';

import { PatientCreate as PatientCreateSchema, type PatientCreate } from '@dms/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useCreatePatientMutation, type ErrorResponse } from '@/src/store/api';

type Props = {
  onClose: () => void;
};

type ApiError = {
  status?: number;
  data?: unknown;
};

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
    formState: { errors, isSubmitting },
  } = useForm<PatientCreate>({
    resolver: zodResolver(PatientCreateSchema),
    mode: 'onBlur',
  });

  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      onClose();
    }, 180);
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

      const msg =
        maybe?.message ??
        (e.status === 409
          ? 'A patient already exists with this name and phone.'
          : 'Unable to save patient. Please try again.');

      toast.error(msg);
    }
  };

  const onSubmitError: SubmitErrorHandler<PatientCreate> = (formErrors) => {
    const messages = Object.values(formErrors)
      .map((e) => e?.message)
      .filter((m): m is string => Boolean(m));

    toast.error(messages.length > 0 ? messages.join('\n') : 'Please check the highlighted fields.');
  };

  return (
    <div
      className={[
        // ✅ content-area overlay (NOT full screen)
        'absolute inset-0 z-30 flex items-center justify-center',
        // backdrop
        'bg-black/10 backdrop-blur-sm',
        // fade in/out
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
          // pop in/out
          mounted && !closing ? 'scale-100 translate-y-0' : 'scale-[0.98] translate-y-1',
          'transition-transform duration-200 ease-out',
        ].join(' ')}
      >
        <Card className="min-w-120 max-w-xl rounded-2xl border-none bg-white shadow-lg gap-2">
          <CardHeader className="pb-1">
            <CardTitle className="text-xl font-semibold text-gray-900 ">Create Patient</CardTitle>
          </CardHeader>

          <CardContent className="pt-0">
            <form
              className="grid gap-2"
              onSubmit={handleSubmit(onSubmit, onSubmitError)}
              noValidate
            >
              {/* Name */}
              <div className="space-y-1">
                <Label htmlFor="name" className="text-sm font-medium text-gray-800">
                  Name
                </Label>
                <Input
                  id="name"
                  autoFocus
                  placeholder="Enter patient name..."
                  className={`h-10 rounded-xl text-sm ${
                    errors.name
                      ? 'border-red-500 focus-visible:ring-red-500'
                      : 'border-gray-200 focus-visible:ring-gray-300'
                  }`}
                  {...register('name')}
                />
                <p className="h-3 text-xs">&nbsp;</p>
              </div>

              {/* Phone */}
              <div className="space-y-1">
                <Label htmlFor="phone" className="text-sm font-medium text-gray-800">
                  Contact No.
                </Label>
                <Input
                  id="phone"
                  inputMode="tel"
                  placeholder="Enter contact number..."
                  className={`h-10 rounded-xl text-sm ${
                    errors.phone
                      ? 'border-red-500 focus-visible:ring-red-500'
                      : 'border-gray-200 focus-visible:ring-gray-300'
                  }`}
                  {...register('phone')}
                />
                <p className="h-3 text-xs">&nbsp;</p>
              </div>

              {/* Gender + DOB */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="gender" className="text-sm font-medium text-gray-800">
                    Gender
                  </Label>
                  <select
                    id="gender"
                    className={`h-10 w-full rounded-xl border bg-white px-3 text-sm ${
                      errors.gender
                        ? 'border-red-500 focus-visible:ring-red-500'
                        : 'border-gray-200 focus-visible:ring-gray-300'
                    }`}
                    {...register('gender')}
                  >
                    <option value="">Choose a category</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                  <p className="h-3 text-xs">&nbsp;</p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="dob" className="text-sm font-medium text-gray-800">
                    DOB
                  </Label>
                  <Input
                    id="dob"
                    type="date"
                    className={`h-10 rounded-xl text-sm ${
                      errors.dob
                        ? 'border-red-500 focus-visible:ring-red-500'
                        : 'border-gray-200 focus-visible:ring-gray-300'
                    }`}
                    {...register('dob')}
                  />
                  <p className="h-3 text-xs">&nbsp;</p>
                </div>
              </div>

              {/* Address */}
              <div className="space-y-1">
                <Label htmlFor="address" className="text-sm font-medium text-gray-800">
                  Address
                </Label>
                <Textarea
                  id="address"
                  placeholder="Type patient address here..."
                  className={`min-h-[90px] rounded-xl text-sm ${
                    // @ts-expect-error address exists in your form shape even if schema may lag
                    errors.address
                      ? 'border-red-500 focus-visible:ring-red-500'
                      : 'border-gray-200 focus-visible:ring-gray-300'
                  }`}
                  // @ts-expect-error address exists in your form shape even if schema may lag
                  {...register('address')}
                />
                <p className="h-3 text-xs">&nbsp;</p>
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
