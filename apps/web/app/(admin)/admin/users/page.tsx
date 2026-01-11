// apps/web/app/(admin)/admin/users/page.tsx
'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

import { Loader2, Plus, Search, Trash2, KeyRound } from 'lucide-react';

import type { Role } from '@dms/types';
import {
  useAdminListUsersQuery,
  useAdminCreateUserMutation,
  useAdminUpdateUserMutation,
  useAdminDeleteUserMutation,
  useAdminResetUserPasswordMutation,
} from '@/src/store/api';

import { useAuth } from '@/src/hooks/useAuth';

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: 'RECEPTION', label: 'Reception' },
  { value: 'VIEWER', label: 'Viewer' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'DOCTOR', label: 'Doctor' },
];

function roleBadge(role: Role) {
  const label = ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
  return (
    <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
      {label}
    </Badge>
  );
}

// ---- small safe helpers (avoid `any`) ----
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readCurrentUserId(auth: unknown): string | null {
  if (!isRecord(auth)) return null;

  const direct = auth.userId;
  if (typeof direct === 'string') return direct;

  const user = auth.user;
  if (isRecord(user) && typeof user.userId === 'string') return user.userId;

  return null;
}

function isRole(v: string): v is Role {
  return ROLE_OPTIONS.some((r) => r.value === v);
}

type ActiveFilter = 'all' | 'active' | 'inactive';
function isActiveFilter(v: string): v is ActiveFilter {
  return v === 'all' || v === 'active' || v === 'inactive';
}

export default function AdminUsersPage() {
  const auth = useAuth();
  const currentUserId = readCurrentUserId(auth);

  const [query, setQuery] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [active, setActive] = useState<ActiveFilter>('all');

  const filters = useMemo(() => {
    return {
      query: query.trim() ? query.trim() : undefined,
      role: role ? role : undefined,
      active: active === 'all' ? undefined : active === 'active',
    };
  }, [query, role, active]);

  const usersQuery = useAdminListUsersQuery(filters);

  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<Role>('RECEPTION');
  const [createActive, setCreateActive] = useState(true);

  const [createUser, createState] = useAdminCreateUserMutation();
  const [updateUser] = useAdminUpdateUserMutation();
  const [deleteUser, deleteState] = useAdminDeleteUserMutation();

  const [resetPassword, resetState] = useAdminResetUserPasswordMutation();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetUserLabel, setResetUserLabel] = useState<string>('');
  const [resetPass1, setResetPass1] = useState('');
  const [resetPass2, setResetPass2] = useState('');

  const rawItems = usersQuery.data?.items ?? [];
  const loading = usersQuery.isFetching;

  const items = useMemo(() => {
    if (!currentUserId) return rawItems;
    return rawItems.filter((u) => u.userId !== currentUserId);
  }, [rawItems, currentUserId]);

  const resetCreate = () => {
    setCreateEmail('');
    setCreateName('');
    setCreatePassword('');
    setCreateRole('RECEPTION');
    setCreateActive(true);
  };

  const canCreate =
    createEmail.trim().length > 0 &&
    createName.trim().length > 0 &&
    createPassword.trim().length >= 8 &&
    createRole !== 'DOCTOR';

  const openReset = (userId: string, label: string) => {
    setResetUserId(userId);
    setResetUserLabel(label);
    setResetPass1('');
    setResetPass2('');
    setResetOpen(true);
  };

  const canReset = resetUserId && resetPass1.length >= 8 && resetPass1 === resetPass2;

  return (
    <div className="p-4 2xl:p-12">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="mt-1 text-sm text-gray-600">
            Create and manage Reception/Viewer users. Toggle active to block login.
          </p>
        </div>

        <Button
          className="h-9 rounded-xl"
          onClick={() => {
            resetCreate();
            setCreateOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      <Card className="rounded-2xl border bg-white p-0 shadow-none">
        <div className="border-b px-5 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900">User Directory</div>
              <div className="text-[11px] text-gray-500">
                Manage roles, active status, password reset, and deletion. (Your admin account is
                hidden.)
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  className="h-9 rounded-xl pl-9 text-sm"
                  placeholder="Search name / email…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <select
                className="h-9 rounded-xl border border-input bg-background px-3 text-sm"
                value={role}
                onChange={(e) => {
                  const v = e.target.value;
                  setRole(v === '' ? '' : isRole(v) ? v : '');
                }}
              >
                <option value="">All roles</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>

              <select
                className="h-9 rounded-xl border border-input bg-background px-3 text-sm"
                value={active}
                onChange={(e) => {
                  const v = e.target.value;
                  if (isActiveFilter(v)) setActive(v);
                }}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-[11px] font-semibold text-gray-600">
              <tr>
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Active</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-gray-500" colSpan={4}>
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Loading users…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-gray-500" colSpan={4}>
                    No users found.
                  </td>
                </tr>
              ) : (
                items.map((u) => {
                  const isSelf = !!currentUserId && u.userId === currentUserId;

                  return (
                    <tr key={u.userId} className="hover:bg-gray-50/60">
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-900">{u.displayName}</div>
                        <div className="text-[12px] text-gray-500">{u.email}</div>
                      </td>

                      <td className="px-5 py-4">{roleBadge(u.role)}</td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={u.active}
                            disabled={isSelf}
                            onCheckedChange={async (checked) => {
                              if (isSelf) return;
                              await updateUser({
                                userId: u.userId,
                                patch: { active: checked },
                              }).unwrap();
                            }}
                          />
                          <span className="text-[12px] text-gray-600">
                            {u.active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            className="h-8 rounded-xl px-3 text-xs"
                            disabled={isSelf}
                            onClick={() => openReset(u.userId, `${u.displayName} (${u.email})`)}
                            title={isSelf ? 'Not allowed' : 'Reset password'}
                          >
                            <KeyRound className="mr-2 h-4 w-4" />
                            Reset
                          </Button>

                          <Button
                            variant="destructive"
                            className="h-8 rounded-xl px-3 text-xs"
                            disabled={deleteState.isLoading || isSelf}
                            onClick={async () => {
                              if (isSelf) return;
                              const ok = window.confirm(
                                `Delete "${u.displayName}"?\nThis cannot be undone.`,
                              );
                              if (!ok) return;
                              await deleteUser({ userId: u.userId }).unwrap();
                            }}
                            title={isSelf ? 'You cannot delete yourself' : 'Delete user'}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {usersQuery.isError ? (
          <div className="border-t px-5 py-3 text-[11px] text-red-600">
            Failed to load users. Check API logs / network tab.
          </div>
        ) : (
          <div className="border-t px-5 py-3 text-[11px] text-gray-500">
            Tip: Inactive users cannot login or call APIs (enforced in auth middleware).
          </div>
        )}
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) resetCreate();
        }}
      >
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Email</Label>
              <Input
                className="h-10 rounded-xl"
                placeholder="user@example.com"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Display name</Label>
              <Input
                className="h-10 rounded-xl"
                placeholder="Reception Desk"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Password</Label>
              <Input
                className="h-10 rounded-xl"
                type="password"
                placeholder="Min 8 characters"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Role</Label>
                <select
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  value={createRole}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (isRole(v)) setCreateRole(v);
                  }}
                >
                  <option value="RECEPTION">Reception</option>
                  <option value="VIEWER">Viewer</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <div className="text-[11px] text-gray-500">
                  Doctors are created in the Doctors page.
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Active</Label>
                <div className="flex h-10 items-center gap-2 rounded-xl border px-3">
                  <Switch checked={createActive} onCheckedChange={setCreateActive} />
                  <span className="text-sm text-gray-700">
                    {createActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
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
                  await createUser({
                    email: createEmail.trim(),
                    displayName: createName.trim(),
                    password: createPassword,
                    role: createRole,
                    active: createActive,
                  }).unwrap();

                  setCreateOpen(false);
                }}
              >
                {createState.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create
              </Button>
            </div>

            {createState.isError ? (
              <div className="text-[11px] text-red-600">
                Failed to create user. If email already exists, choose another.
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={resetOpen}
        onOpenChange={(o) => {
          setResetOpen(o);
          if (!o) {
            setResetUserId(null);
            setResetUserLabel('');
            setResetPass1('');
            setResetPass2('');
          }
        }}
      >
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>

          <div className="space-y-2 text-[12px] text-gray-600">
            Resetting password for:{' '}
            <span className="font-medium text-gray-800">{resetUserLabel}</span>
          </div>

          <div className="mt-3 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">New password</Label>
              <Input
                className="h-10 rounded-xl"
                type="password"
                placeholder="Min 8 characters"
                value={resetPass1}
                onChange={(e) => setResetPass1(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Confirm password</Label>
              <Input
                className="h-10 rounded-xl"
                type="password"
                placeholder="Repeat password"
                value={resetPass2}
                onChange={(e) => setResetPass2(e.target.value)}
              />
              {resetPass2.length > 0 && resetPass1 !== resetPass2 ? (
                <div className="text-[11px] text-red-600">Passwords do not match.</div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                className="h-9 rounded-xl"
                onClick={() => setResetOpen(false)}
              >
                Cancel
              </Button>

              <Button
                className="h-9 rounded-xl"
                disabled={!canReset || resetState.isLoading}
                onClick={async () => {
                  if (!resetUserId) return;
                  await resetPassword({
                    userId: resetUserId,
                    body: { password: resetPass1 },
                  }).unwrap();
                  setResetOpen(false);
                }}
              >
                {resetState.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Reset Password
              </Button>
            </div>

            {resetState.isError ? (
              <div className="text-[11px] text-red-600">Failed to reset password.</div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
