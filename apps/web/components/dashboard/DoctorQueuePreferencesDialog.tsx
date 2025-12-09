// apps/web/components/dashboard/DoctorQueuePreferencesDialog.tsx
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'react-toastify';
import {
  useGetDoctorsQuery,
  useGetMyPreferencesQuery,
  useUpdateMyPreferencesMutation,
} from '@/src/store/api';
import { useAuth } from '@/src/hooks/useAuth';
import type { UserPreferences } from '@dms/types';

const MAX_DOCTORS = 3;

export default function DoctorQueuePreferencesDialog() {
  const auth = useAuth();

  const canEditRole = auth.role === 'RECEPTION' || auth.role === 'ADMIN';
  const isAuthed = auth.status === 'authenticated' && !!auth.accessToken;
  const shouldSkipQueries = !canEditRole || !isAuthed;

  const [open, setOpen] = React.useState(false);
  const [localSelection, setLocalSelection] = React.useState<string[]>([]);

  const { data: doctors, isLoading: doctorsLoading } = useGetDoctorsQuery(undefined, {
    skip: shouldSkipQueries,
  });

  const {
    data: prefs,
    isLoading: prefsLoading,
    isFetching: prefsFetching,
  } = useGetMyPreferencesQuery(undefined, {
    skip: shouldSkipQueries,
  });

  const [updatePrefs, { isLoading: saving }] = useUpdateMyPreferencesMutation();

  // Initialise local selection from preferences or fallback to first 3 active doctors
  React.useEffect(() => {
    if (shouldSkipQueries) return;
    if (!doctors || (!prefs && prefsLoading)) return;

    const prefIds = prefs?.dashboard?.selectedDoctorIds ?? [];

    if (prefIds.length > 0) {
      setLocalSelection(prefIds);
      return;
    }

    const activeDoctors = doctors.filter((d) => d.active);
    const initialIds = activeDoctors.slice(0, MAX_DOCTORS).map((d) => d.doctorId);
    setLocalSelection(initialIds);
  }, [doctors, prefs, prefsLoading, shouldSkipQueries]);

  // If user can't edit, don't render the button at all
  if (!canEditRole) return null;

  const toggleDoctor = (id: string) => {
    setLocalSelection((prev) => {
      const already = prev.includes(id);
      if (already) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_DOCTORS) return prev;
      return [...prev, id];
    });
  };

  const handleSave = async () => {
    if (!doctors) return;

    const base: UserPreferences =
      (prefs as UserPreferences) ??
      ({
        dashboard: { selectedDoctorIds: [] },
      } as UserPreferences);

    const next: UserPreferences = {
      ...base,
      dashboard: {
        ...(base.dashboard ?? {}),
        selectedDoctorIds: localSelection,
      },
    };

    try {
      await updatePrefs(next).unwrap();
      toast.success('Doctor queue preferences updated.');
      setOpen(false);
    } catch {
      toast.error('Unable to save preferences right now.');
    }
  };

  const loading = !shouldSkipQueries && (doctorsLoading || prefsLoading || prefsFetching);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 rounded-full border-gray-200 px-3 text-[11px] font-medium text-gray-700 hover:bg-gray-100"
        >
          Doctors
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Choose doctors for queue</DialogTitle>
          <DialogDescription className="text-xs">
            Select up to {MAX_DOCTORS} doctors whose queue you want to monitor on this dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
          <span>
            Selected:&nbsp;
            <span className="font-semibold text-gray-800">{localSelection.length}</span> /{' '}
            {MAX_DOCTORS}
          </span>
        </div>

        <div className="mt-3 max-h-60 space-y-1 overflow-y-auto rounded-xl bg-gray-50 p-2">
          {loading && <div className="px-2 py-2 text-xs text-gray-500">Loading doctors…</div>}

          {!loading && doctors && doctors.length === 0 && (
            <div className="px-2 py-2 text-xs text-gray-500">
              No doctors available. Please contact admin.
            </div>
          )}

          {!loading &&
            doctors &&
            doctors.map((doc) => {
              const checked = localSelection.includes(doc.doctorId);

              return (
                <div
                  key={doc.doctorId}
                  role="button"
                  tabIndex={0}
                  className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-xs hover:bg-gray-100"
                  onClick={() => toggleDoctor(doc.doctorId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleDoctor(doc.doctorId);
                    }
                  }}
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900">
                      {doc.fullName ?? doc.displayName}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {doc.specialization ?? 'Doctor'}
                    </span>
                  </div>

                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleDoctor(doc.doctorId)}
                    className="h-4 w-4"
                  />
                </div>
              );
            })}
        </div>

        <DialogFooter className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-full px-4 text-xs font-semibold"
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
