'use client';

import * as React from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { toast } from 'react-toastify';

import type { Patient, PatientUpdate } from '@dcm/types';
import { useUpdatePatientMutation } from '@/src/store/api';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import PatientDobCalendar from '@/components/patients/PatientDobCalendar';

const EditPatientSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(6),
  dob: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNKNOWN']).optional(),
  address: z.string().optional(),
});

type FormValues = z.infer<typeof EditPatientSchema>;

type Props = {
  patient: Patient;
  onClose: () => void;
};

type UnknownRecord = Record<string, unknown>;
const isRecord = (v: unknown): v is UnknownRecord => typeof v === 'object' && v !== null;

export default function EditPatientModal({ patient, onClose }: Props) {
  const [updatePatient, { isLoading }] = useUpdatePatientMutation();
  const [dobOpen, setDobOpen] = React.useState(false);
  const [closing, setClosing] = React.useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(EditPatientSchema),
    defaultValues: {
      name: patient.name,
      phone: patient.phone,
      dob: patient.dob,
      gender: patient.gender,
      address: patient.address ?? '',
    },
  });

  const dobIso = watch('dob');
  const dobDate = dobIso ? new Date(dobIso) : undefined;

  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 180);
  };

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    const patch: PatientUpdate = {
      name: values.name.trim(),
      phone: values.phone.trim(),
      dob: values.dob || undefined,
      gender: values.gender,
      address: values.address?.trim() || undefined,
    };

    try {
      await updatePatient({
        patientId: patient.patientId,
        patch,
      }).unwrap();

      toast.success('Patient details updated');
      close();
    } catch (err: unknown) {
      const msg =
        isRecord(err) &&
        'data' in err &&
        isRecord((err as { data?: unknown }).data) &&
        typeof (err as { data: UnknownRecord }).data.message === 'string'
          ? String((err as { data: UnknownRecord }).data.message)
          : 'Failed to update patient';

      toast.error(msg);
    }
  };

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/10 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <Card className="w-full max-w-xl rounded-2xl border-none shadow-lg">
        <CardHeader>
          <CardTitle>Edit Patient</CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input {...register('name')} className="rounded-xl" />
            </div>

            <div>
              <Label>Contact No.</Label>
              <Input {...register('phone')} className="rounded-xl" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Gender</Label>
                <select {...register('gender')} className="h-10 w-full rounded-xl border px-3">
                  <option value="">—</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                  <option value="UNKNOWN">Unknown</option>
                </select>
              </div>

              <div>
                <Label>DOB</Label>
                <Popover open={dobOpen} onOpenChange={setDobOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between rounded-xl">
                      <span className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        {dobDate ? format(dobDate, 'dd/MM/yyyy') : 'Pick date'}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 bg-transparent border-none">
                    <PatientDobCalendar
                      value={dobDate}
                      onChange={(d) => {
                        if (!d) return;
                        setValue('dob', d.toISOString().slice(0, 10), {
                          shouldDirty: true,
                        });
                        setDobOpen(false);
                      }}
                      disabled={(d) => d > new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div>
              <Label>Address</Label>
              <Textarea {...register('address')} className="rounded-xl" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || isLoading}>
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
