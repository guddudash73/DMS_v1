'use client';

import * as React from 'react';
import { toast } from 'react-toastify';
import { Pencil, Trash2, Plus } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import type { Assistant } from '@dcm/types';
import {
  useGetAssistantsQuery,
  useCreateAssistantMutation,
  useUpdateAssistantMutation,
  useDeleteAssistantMutation,
} from '@/src/store/api';

type ApiError = {
  status?: number;
  data?: any;
};

function fmtDate(ms: number | undefined) {
  if (!ms || !Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString('en-GB');
}

function getErrorMessage(err: unknown): string {
  const e = err as ApiError;
  return e?.data?.message ?? e?.data?.error ?? 'Request failed.';
}

export default function AssistantsPage() {
  const listQuery = useGetAssistantsQuery(undefined);

  const [createAssistant, createState] = useCreateAssistantMutation();
  const [updateAssistant, updateState] = useUpdateAssistantMutation();
  const [deleteAssistant, deleteState] = useDeleteAssistantMutation();

  const items: Assistant[] = React.useMemo(() => {
    return listQuery.data?.items ?? [];
  }, [listQuery.data]);

  // Keep same as backend: active first, then name
  const sorted = React.useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [items]);

  // dialogs state
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const [name, setName] = React.useState('');
  const [active, setActive] = React.useState(true);

  const [editing, setEditing] = React.useState<Assistant | null>(null);
  const [deleting, setDeleting] = React.useState<Assistant | null>(null);

  const busy =
    listQuery.isFetching || createState.isLoading || updateState.isLoading || deleteState.isLoading;

  const resetForm = () => {
    setName('');
    setActive(true);
  };

  const openCreate = () => {
    resetForm();
    setCreateOpen(true);
  };

  const openEdit = (a: Assistant) => {
    setEditing(a);
    setName(a.name ?? '');
    setActive(Boolean(a.active));
    setEditOpen(true);
  };

  const openDelete = (a: Assistant) => {
    setDeleting(a);
    setDeleteOpen(true);
  };

  const onCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name is required.');
      return;
    }

    try {
      await createAssistant({ name: trimmed, active }).unwrap();
      toast.success('Assistant created.');
      setCreateOpen(false);
      resetForm();
    } catch (e: unknown) {
      toast.error(getErrorMessage(e) ?? 'Failed to create assistant.');
    }
  };

  const onUpdate = async () => {
    if (!editing) return;

    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name is required.');
      return;
    }

    try {
      await updateAssistant({
        assistantId: editing.assistantId,
        patch: { name: trimmed, active },
      }).unwrap();

      toast.success('Assistant updated.');
      setEditOpen(false);
      setEditing(null);
      resetForm();
    } catch (e: unknown) {
      toast.error(getErrorMessage(e) ?? 'Failed to update assistant.');
    }
  };

  const onDelete = async () => {
    if (!deleting) return;

    try {
      await deleteAssistant({ assistantId: deleting.assistantId }).unwrap();
      toast.success('Assistant deleted.');
      setDeleteOpen(false);
      setDeleting(null);
    } catch (e: unknown) {
      toast.error(getErrorMessage(e) ?? 'Failed to delete assistant.');
    }
  };

  const listErrorMessage = React.useMemo(() => {
    if (!listQuery.isError) return null;
    const e = listQuery.error as ApiError;
    return e?.data?.message ?? 'Failed to load assistants.';
  }, [listQuery.isError, listQuery.error]);

  return (
    <section className="px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-lg font-semibold text-gray-900">Assistants</div>
          <div className="mt-0.5 text-xs text-gray-500">
            Create, edit, enable/disable, and delete assistants.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="rounded-xl cursor-pointer bg-black text-white hover:bg-black/90"
            onClick={openCreate}
            disabled={busy}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Assistant
          </Button>

          <Button
            type="button"
            variant="outline"
            className="rounded-xl cursor-pointer"
            onClick={() => listQuery.refetch()}
            disabled={busy}
          >
            Refresh
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border bg-white p-4">
        {listQuery.isLoading ? (
          <div className="p-6 text-sm text-gray-500">Loading assistants…</div>
        ) : listQuery.isError ? (
          <div className="p-6 text-sm text-red-600">{listErrorMessage}</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="font-semibold text-gray-600">Name</TableHead>
                  <TableHead className="font-semibold text-gray-600">Active</TableHead>
                  <TableHead className="font-semibold text-gray-600">Created</TableHead>
                  <TableHead className="font-semibold text-gray-600">Updated</TableHead>
                  <TableHead className="text-right font-semibold text-gray-600">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-gray-500">
                      No assistants yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((a) => (
                    <TableRow key={a.assistantId} className="hover:bg-gray-50/60">
                      <TableCell className=" py-4 text-sm font-medium text-gray-900">
                        {a.name}
                      </TableCell>

                      <TableCell className="py-4 text-sm">
                        {a.active ? (
                          <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                            INACTIVE
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="py-4 text-xs text-gray-600">
                        {fmtDate(a.createdAt)}
                      </TableCell>

                      <TableCell className="py-4 text-xs text-gray-600">
                        {fmtDate(a.updatedAt)}
                      </TableCell>

                      <TableCell className="py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-xl px-3 text-xs cursor-pointer"
                            onClick={() => openEdit(a)}
                            disabled={busy}
                          >
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Edit
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-xl px-3 text-xs cursor-pointer"
                            onClick={() => openDelete(a)}
                            disabled={busy}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Create Assistant</DialogTitle>
            <DialogDescription>Add a new assistant entry.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <div className="text-xs font-semibold text-gray-700">Name</div>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ayesha"
                className="rounded-xl"
                maxLength={64}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border bg-gray-50 px-3 py-2">
              <div>
                <div className="text-sm font-semibold text-gray-900">Active</div>
                <div className="text-xs text-gray-500">
                  Inactive assistants won’t appear in pickers.
                </div>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setCreateOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-black text-white hover:bg-black/90"
              onClick={onCreate}
              disabled={busy}
            >
              {createState.isLoading ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) {
            setEditing(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit Assistant</DialogTitle>
            <DialogDescription>Update assistant name or active status.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <div className="text-xs font-semibold text-gray-700">Name</div>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Assistant name"
                className="rounded-xl"
                maxLength={64}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border bg-gray-50 px-3 py-2">
              <div>
                <div className="text-sm font-semibold text-gray-900">Active</div>
                <div className="text-xs text-gray-500">
                  Inactive assistants won’t appear in pickers.
                </div>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setEditOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-black text-white hover:bg-black/90"
              onClick={onUpdate}
              disabled={busy || !editing}
            >
              {updateState.isLoading ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setDeleting(null);
        }}
      >
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete Assistant</DialogTitle>
            <DialogDescription>
              This will permanently remove{' '}
              <span className="font-semibold text-gray-900">
                {deleting?.name ?? 'this assistant'}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setDeleteOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-red-600 text-white hover:bg-red-700"
              onClick={onDelete}
              disabled={busy || !deleting}
            >
              {deleteState.isLoading ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
