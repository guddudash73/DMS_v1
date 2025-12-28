'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { Loader2, Pencil, Plus, Search } from 'lucide-react';

import type { AdminDoctorListItem } from '@dms/types';
import {
  useAdminGetDoctorsQuery,
  useAdminCreateDoctorMutation,
  useAdminUpdateDoctorMutation,
} from '@/src/store/api';

function statusBadge(active: boolean) {
  return active ? (
    <Badge className="rounded-full px-3 py-1 text-[11px]" variant="secondary">
      Active
    </Badge>
  ) : (
    <Badge className="rounded-full px-3 py-1 text-[11px]" variant="destructive">
      Inactive
    </Badge>
  );
}

export default function AdminDoctorsPage() {
  const [query, setQuery] = useState('');

  const doctorsQ = useAdminGetDoctorsQuery();
  const [createDoctor, createState] = useAdminCreateDoctorMutation();
  const [updateDoctor, updateState] = useAdminUpdateDoctorMutation();

  const all = doctorsQ.data ?? [];
  const loading = doctorsQ.isFetching;

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;

    return all.filter((d) => {
      const hay = [
        d.fullName,
        d.displayName,
        d.email,
        d.registrationNumber,
        d.specialization,
        d.contact ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [all, query]);

  // ---- Create modal state ----
  const [createOpen, setCreateOpen] = useState(false);
  const [cEmail, setCEmail] = useState('');
  const [cDisplayName, setCDisplayName] = useState('');
  const [cPassword, setCPassword] = useState('');
  const [cFullName, setCFullName] = useState('');
  const [cReg, setCReg] = useState('');
  const [cSpec, setCSpec] = useState('');
  const [cContact, setCContact] = useState('');

  const resetCreate = () => {
    setCEmail('');
    setCDisplayName('');
    setCPassword('');
    setCFullName('');
    setCReg('');
    setCSpec('');
    setCContact('');
  };

  const canCreate =
    cEmail.trim().length > 0 &&
    cDisplayName.trim().length > 0 &&
    cPassword.trim().length >= 8 &&
    cFullName.trim().length > 0 &&
    cReg.trim().length > 0 &&
    cSpec.trim().length > 0;

  // ---- Edit modal state ----
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<AdminDoctorListItem | null>(null);

  const [eFullName, setEFullName] = useState('');
  const [eReg, setEReg] = useState('');
  const [eSpec, setESpec] = useState('');
  const [eContact, setEContact] = useState('');

  const openEdit = (d: AdminDoctorListItem) => {
    setEditing(d);
    setEFullName(d.fullName);
    setEReg(d.registrationNumber);
    setESpec(d.specialization);
    setEContact(d.contact ?? '');
    setEditOpen(true);
  };

  const canSaveEdit =
    !!editing && eFullName.trim().length > 0 && eReg.trim().length > 0 && eSpec.trim().length > 0;

  // ---- Header Right ----
  const headerRight = useMemo(() => {
    return (
      <div className="flex items-center gap-2">
        <div className="relative w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            className="h-9 rounded-xl pl-9 text-sm"
            placeholder="Search doctors…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <Button
          className="h-9 rounded-xl"
          onClick={() => {
            resetCreate();
            setCreateOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Doctor
        </Button>
      </div>
    );
  }, [query]);

  return (
    <div className="p-4 2xl:p-12">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Doctors</h2>
          <p className="mt-1 text-sm text-gray-600">
            Create and manage doctor users, profiles, and active status.
          </p>
        </div>
        {headerRight}
      </div>

      <Card className="rounded-2xl border bg-white p-0 shadow-none">
        <div className="border-b px-5 py-3">
          <div className="text-sm font-semibold text-gray-900">Doctor Directory</div>
          <div className="text-[11px] text-gray-500">
            Showing: <span className="font-medium text-gray-700">{items.length}</span> · Filter:{' '}
            <span className="font-medium text-gray-700">{query || 'All'}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-[11px] font-semibold text-gray-600">
              <tr>
                <th className="px-5 py-3">Doctor</th>
                <th className="px-5 py-3">Registration</th>
                <th className="px-5 py-3">Specialization</th>
                <th className="px-5 py-3">Active</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-gray-500" colSpan={5}>
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Loading doctors…
                  </td>
                </tr>
              ) : doctorsQ.isError ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-red-600" colSpan={5}>
                    Failed to load doctors. Check API logs / network tab.
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-gray-500" colSpan={5}>
                    No doctors found.
                  </td>
                </tr>
              ) : (
                items.map((d) => (
                  <tr key={d.doctorId} className="hover:bg-gray-50/60">
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-900">{d.fullName}</div>
                      <div className="text-[12px] text-gray-500">
                        {d.displayName} · {d.email}
                      </div>
                      {d.contact ? (
                        <div className="text-[12px] text-gray-500">Contact: {d.contact}</div>
                      ) : null}
                    </td>

                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-900">{d.registrationNumber}</div>
                    </td>

                    <td className="px-5 py-4">{d.specialization}</td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={d.active}
                          disabled={updateState.isLoading}
                          onCheckedChange={async (checked) => {
                            await updateDoctor({
                              doctorId: d.doctorId,
                              patch: { active: checked },
                            }).unwrap();
                          }}
                        />
                        {statusBadge(d.active)}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        Inactive doctors cannot login.
                      </div>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <Button
                        variant="secondary"
                        className="h-8 rounded-xl px-3 text-xs"
                        onClick={() => openEdit(d)}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t px-5 py-3 text-[11px] text-gray-500">
          Tip: toggling active should also update the underlying user record (enforced by auth
          middleware).
        </div>
      </Card>

      {/* CREATE DOCTOR */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) resetCreate();
        }}
      >
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add Doctor</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs">Email</Label>
              <Input
                className="h-10 rounded-xl"
                placeholder="doctor@example.com"
                value={cEmail}
                onChange={(e) => setCEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Display name</Label>
              <Input
                className="h-10 rounded-xl"
                placeholder="Dr. John (Login name)"
                value={cDisplayName}
                onChange={(e) => setCDisplayName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Password</Label>
              <Input
                className="h-10 rounded-xl"
                type="password"
                placeholder="Min 8 characters"
                value={cPassword}
                onChange={(e) => setCPassword(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Full name</Label>
              <Input
                className="h-10 rounded-xl"
                placeholder="Dr. John Doe"
                value={cFullName}
                onChange={(e) => setCFullName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Registration number</Label>
              <Input
                className="h-10 rounded-xl"
                placeholder="REG-12345"
                value={cReg}
                onChange={(e) => setCReg(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Specialization</Label>
              <Input
                className="h-10 rounded-xl"
                placeholder="Oral surgery"
                value={cSpec}
                onChange={(e) => setCSpec(e.target.value)}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label className="text-xs">Contact (optional)</Label>
              <Input
                className="h-10 rounded-xl"
                placeholder="+91…"
                value={cContact}
                onChange={(e) => setCContact(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              className="h-9 rounded-xl"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>

            <Button
              className="h-9 rounded-xl"
              disabled={!canCreate || createState.isLoading}
              onClick={async () => {
                await createDoctor({
                  email: cEmail.trim(),
                  displayName: cDisplayName.trim(),
                  password: cPassword,
                  fullName: cFullName.trim(),
                  registrationNumber: cReg.trim(),
                  specialization: cSpec.trim(),
                  ...(cContact.trim() ? { contact: cContact.trim() } : {}),
                }).unwrap();

                setCreateOpen(false);
              }}
            >
              {createState.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Doctor
            </Button>
          </div>

          {createState.isError ? (
            <div className="mt-2 text-[11px] text-red-600">
              Failed to create doctor. Check if email already exists.
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* EDIT DOCTOR */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditing(null);
        }}
      >
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit Doctor</DialogTitle>
          </DialogHeader>

          {!editing ? (
            <div className="text-sm text-gray-500">No doctor selected.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">Full name</Label>
                  <Input
                    className="h-10 rounded-xl"
                    value={eFullName}
                    onChange={(e) => setEFullName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Registration number</Label>
                  <Input
                    className="h-10 rounded-xl"
                    value={eReg}
                    onChange={(e) => setEReg(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Specialization</Label>
                  <Input
                    className="h-10 rounded-xl"
                    value={eSpec}
                    onChange={(e) => setESpec(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Contact (optional)</Label>
                  <Input
                    className="h-10 rounded-xl"
                    value={eContact}
                    onChange={(e) => setEContact(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  className="h-9 rounded-xl"
                  onClick={() => setEditOpen(false)}
                >
                  Cancel
                </Button>

                <Button
                  className="h-9 rounded-xl"
                  disabled={!canSaveEdit || updateState.isLoading}
                  onClick={async () => {
                    await updateDoctor({
                      doctorId: editing.doctorId,
                      patch: {
                        fullName: eFullName.trim(),
                        registrationNumber: eReg.trim(),
                        specialization: eSpec.trim(),
                        contact: eContact.trim() ? eContact.trim() : undefined,
                      },
                    }).unwrap();

                    setEditOpen(false);
                  }}
                >
                  {updateState.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Changes
                </Button>
              </div>

              {updateState.isError ? (
                <div className="mt-2 text-[11px] text-red-600">Failed to update doctor.</div>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
