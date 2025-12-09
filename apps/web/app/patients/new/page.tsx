// apps/web/app/patients/new/page.tsx
'use client';

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
import ClinicShell from '@/components/layout/ClinicShell';
import { useCreatePatientMutation, type ErrorResponse } from '@/src/store/api';
import { useRequireAuth } from '@/src/hooks/useAuth';

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

export default function NewPatientPage() {
  const auth = useRequireAuth();
  const authLoading = auth.status === 'checking';

  const router = useRouter();
  const [createPatient, { isLoading }] = useCreatePatientMutation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PatientCreate>({
    resolver: zodResolver(PatientCreateSchema),
    mode: 'onBlur',
  });

  const onSubmit = async (values: PatientCreate) => {
    try {
      const patient = await createPatient(values).unwrap();
      toast.success('Patient created successfully.');
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

    const msg = messages.length > 0 ? messages.join('\n') : 'Please check the highlighted fields.';
    toast.error(msg);
  };

  return (
    <ClinicShell title="New patient">
      {/* Overlay only after auth is resolved */}
      {!authLoading && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/10 backdrop-blur-sm">
          <Card className="w-full max-w-xl rounded-2xl border-none bg-white shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-semibold text-gray-900">Create Patient</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <form
                className="grid gap-4"
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
                      placeholder="dd-mm-yyyy"
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
                      // @ts-expect-error address should exist on PatientCreate once schema is updated
                      errors.address
                        ? 'border-red-500 focus-visible:ring-red-500'
                        : 'border-gray-200 focus-visible:ring-gray-300'
                    }`}
                    // @ts-expect-error address should exist on PatientCreate once schema is updated
                    {...register('address')}
                  />
                  <p className="h-3 text-xs">&nbsp;</p>
                </div>

                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 rounded-xl px-4 text-sm"
                    onClick={() => router.back()}
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
      )}
    </ClinicShell>
  );
}
