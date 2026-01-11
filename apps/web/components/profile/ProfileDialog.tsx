'use client';

import { useEffect, useMemo, useState } from 'react';
import { useGetMeQuery, useUpdateMeMutation } from '@/src/store/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// shadcn dialog
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

function initialsFromName(name: string) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]!.slice(0, 1) + parts[parts.length - 1]!.slice(0, 1)).toUpperCase();
}

type UpdateMeBody = {
  displayName?: string;
  doctorProfile?: {
    fullName?: string;
    contact?: string;
  };
};

export default function ProfileDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const {
    data: me,
    isLoading,
    refetch,
  } = useGetMeQuery(undefined, {
    skip: !props.open, // only fetch when opened
  });
  const [updateMe, { isLoading: isSaving }] = useUpdateMeMutation();

  const [displayName, setDisplayName] = useState('');
  const [doctorFullName, setDoctorFullName] = useState('');
  const [doctorContact, setDoctorContact] = useState('');

  const isDoctor = me?.role === 'DOCTOR';

  const avatarFallback = useMemo(
    () => initialsFromName(me?.displayName ?? me?.email ?? 'User'),
    [me?.displayName, me?.email],
  );

  useEffect(() => {
    if (!me) return;
    setDisplayName(me.displayName ?? '');
    setDoctorFullName(me.doctorProfile?.fullName ?? '');
    setDoctorContact(me.doctorProfile?.contact ?? '');
  }, [me]);

  async function onSave() {
    if (!me) return;

    const body: UpdateMeBody = {};

    if (displayName.trim() !== (me.displayName ?? '')) {
      body.displayName = displayName.trim();
    }

    if (isDoctor) {
      const dp: UpdateMeBody['doctorProfile'] = {};

      if ((doctorFullName ?? '').trim() !== (me.doctorProfile?.fullName ?? '')) {
        if ((doctorFullName ?? '').trim().length > 0) dp.fullName = doctorFullName.trim();
      }

      if ((doctorContact ?? '').trim() !== (me.doctorProfile?.contact ?? '')) {
        if ((doctorContact ?? '').trim().length > 0) dp.contact = doctorContact.trim();
      }

      if (Object.keys(dp).length > 0) body.doctorProfile = dp;
    }

    if (Object.keys(body).length === 0) {
      props.onOpenChange(false);
      return;
    }

    await updateMe(body).unwrap();
    await refetch();
    props.onOpenChange(false);
  }

  function onReset() {
    if (!me) return;
    setDisplayName(me.displayName ?? '');
    setDoctorFullName(me.doctorProfile?.fullName ?? '');
    setDoctorContact(me.doctorProfile?.contact ?? '');
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">My Profile</DialogTitle>
          <DialogDescription>View and update your account information.</DialogDescription>
        </DialogHeader>

        {isLoading || !me ? (
          <div className="py-8 text-sm text-gray-600">Loading profile…</div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-gray-50 text-sm font-semibold text-gray-700">
                  {avatarFallback}
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">{me.displayName}</div>
                  <div className="text-xs text-gray-500">{me.email}</div>
                </div>
              </div>

              <div className="text-right text-xs text-gray-500">
                <div>Role: {me.role}</div>
                <div>{me.active ? 'Active' : 'Inactive'}</div>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <div className="text-xs font-semibold text-gray-700">Email</div>
                <Input value={me.email} disabled />
              </div>

              <div className="grid gap-2">
                <div className="text-xs font-semibold text-gray-700">Role</div>
                <Input value={me.role} disabled />
              </div>

              <div className="grid gap-2">
                <div className="text-xs font-semibold text-gray-700">Display name</div>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Add display name"
                />
                <div className="text-[11px] text-gray-500">
                  This is what appears in the sidebar user pill.
                </div>
              </div>

              {isDoctor ? (
                <div className="rounded-2xl border bg-gray-50 p-4">
                  <div className="text-sm font-semibold text-gray-900">Doctor profile</div>
                  <div className="mt-1 text-xs text-gray-500">
                    Add missing information or update your contact details.
                  </div>

                  <div className="mt-4 grid gap-4">
                    <div className="grid gap-2">
                      <div className="text-xs font-semibold text-gray-700">Full name</div>
                      <Input
                        value={doctorFullName}
                        onChange={(e) => setDoctorFullName(e.target.value)}
                        placeholder="Add full name"
                      />
                    </div>

                    <div className="grid gap-2">
                      <div className="text-xs font-semibold text-gray-700">Contact</div>
                      <Input
                        value={doctorContact}
                        onChange={(e) => setDoctorContact(e.target.value)}
                        placeholder="Add contact number"
                      />
                    </div>

                    <div className="grid gap-2">
                      <div className="text-xs font-semibold text-gray-700">Registration #</div>
                      <Input value={me.doctorProfile?.registrationNumber ?? ''} disabled />
                    </div>

                    <div className="grid gap-2">
                      <div className="text-xs font-semibold text-gray-700">Specialization</div>
                      <Input value={me.doctorProfile?.specialization ?? ''} disabled />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                className="cursor-pointer"
                onClick={onReset}
                disabled={isSaving}
              >
                Reset
              </Button>
              <Button onClick={onSave} className="cursor-pointer" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
