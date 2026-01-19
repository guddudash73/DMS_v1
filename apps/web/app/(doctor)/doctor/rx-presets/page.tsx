'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Trash2, Pencil, Eye } from 'lucide-react';

import { useAuth } from '@/src/hooks/useAuth';
import {
  useGetMeQuery,
  useGetRxPresetsQuery,
  useDeleteRxPresetMutation,
  useUpdateRxPresetMutation,
} from '@/src/store/api';
import type { PrescriptionPreset, RxPresetFilter } from '@dcm/types';

type RxPresetScope = 'ADMIN' | 'PUBLIC' | 'PRIVATE';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getScopeFromPreset(p: PrescriptionPreset): string | undefined {
  const u = p as unknown;
  if (!isRecord(u)) return undefined;
  const s = u.scope;
  return typeof s === 'string' ? s : undefined;
}

function getCreatedAtFromPreset(p: PrescriptionPreset): number | undefined {
  const u = p as unknown;
  if (!isRecord(u)) return undefined;
  const v = u.createdAt;
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function scopeBadge(scope?: string) {
  if (scope === 'ADMIN') return <Badge className="rounded-full">Admin</Badge>;
  if (scope === 'PUBLIC')
    return (
      <Badge variant="secondary" className="rounded-full">
        Public
      </Badge>
    );
  return (
    <Badge variant="outline" className="rounded-full">
      Private
    </Badge>
  );
}

function formatWhen(ts?: number) {
  if (!ts || !Number.isFinite(ts)) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

export default function DoctorRxPresetsPage() {
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const { data: me } = useGetMeQuery(undefined, { skip: !canUseApi });

  const [filter, setFilter] = useState<RxPresetFilter>('ALL');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const list = useGetRxPresetsQuery(
    { filter, query: debounced || undefined, limit: 50 },
    { skip: !canUseApi },
  );

  const [deletePreset, deleteState] = useDeleteRxPresetMutation();
  const [updatePreset, updateState] = useUpdateRxPresetMutation();

  const items: PrescriptionPreset[] = useMemo(() => list.data?.items ?? [], [list.data?.items]);
  const total = items.length;

  const myUserId = me?.userId ?? auth.userId ?? '';

  const onDelete = async (id: string, name: string) => {
    const ok = window.confirm(`Delete preset "${name}"? This cannot be undone.`);
    if (!ok) return;
    await deletePreset({ id }).unwrap();
  };

  const onMakePublic = async (id: string, name: string) => {
    const ok = window.confirm(
      `Make "${name}" public?\n\nOther doctors will be able to view and use this preset.`,
    );
    if (!ok) return;

    await updatePreset({ id, patch: { scope: 'PUBLIC' } }).unwrap();
  };

  const onMakePrivate = async (id: string, name: string) => {
    const ok = window.confirm(
      `Make "${name}" private again?\n\nOnly you will be able to see it (and admins).`,
    );
    if (!ok) return;

    await updatePreset({ id, patch: { scope: 'PRIVATE' } }).unwrap();
  };

  const headerRight = useMemo(() => {
    return (
      <div className="flex items-center gap-2">
        <Select value={filter} onValueChange={(v) => setFilter(v as RxPresetFilter)}>
          <SelectTrigger className="h-9 w-48 rounded-xl bg-white text-sm">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Show all</SelectItem>
            <SelectItem value="MINE">Show my presets</SelectItem>
            <SelectItem value="ADMIN">Admin presets</SelectItem>
            <SelectItem value="PUBLIC">Public presets</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            className="h-9 rounded-xl pl-9 text-sm"
            placeholder="Search presets…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <Button asChild className="h-9 rounded-xl">
          <Link href="/doctor/rx-presets/new">
            <Plus className="mr-2 h-4 w-4" />
            New Preset
          </Link>
        </Button>
      </div>
    );
  }, [filter, query]);

  if (!canUseApi) {
    return (
      <div className="p-4 2xl:p-12">
        <Card className="rounded-2xl border bg-white p-6 text-sm text-gray-700">
          Please log in to view Rx presets.
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 2xl:p-12">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Rx Presets</h2>
          <p className="mt-1 text-sm text-gray-600">
            Browse presets (admin/public) or create your own templates.
          </p>
        </div>
        {headerRight}
      </div>

      <Card className="rounded-2xl border bg-white p-0 shadow-none">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Templates</div>
            <div className="text-[11px] text-gray-500">
              Filter: <span className="font-medium text-gray-700">{filter}</span>
              <span className="mx-2">·</span>
              Search:{' '}
              <span className="font-medium text-gray-700">{debounced ? debounced : 'All'}</span>
              <span className="mx-2">·</span>
              Total: <span className="font-medium text-gray-700">{total}</span>
            </div>
          </div>

          {(list.isLoading || list.isFetching) && (
            <div className="text-[11px] text-gray-500">Loading…</div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-[11px] font-semibold text-gray-600">
              <tr>
                <th className="px-5 py-3">Preset</th>
                <th className="px-5 py-3">Scope</th>
                <th className="px-5 py-3">Lines</th>
                <th className="px-5 py-3">Tags</th>
                <th className="px-5 py-3">Created at</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {list.isLoading && (
                <tr className="text-gray-500">
                  <td className="px-5 py-4" colSpan={6}>
                    Loading…
                  </td>
                </tr>
              )}

              {!list.isLoading && items.length === 0 && (
                <tr className="text-gray-500">
                  <td className="px-5 py-4" colSpan={6}>
                    No presets found.
                  </td>
                </tr>
              )}

              {items.map((p) => {
                const scope = getScopeFromPreset(p) as RxPresetScope | string | undefined;
                const isAdminPreset = scope === 'ADMIN';
                const isOwner = p.createdByUserId === myUserId;

                const isPrivate = !scope || scope === 'PRIVATE';
                const isPublic = scope === 'PUBLIC';

                const canEdit = !isAdminPreset && (isOwner || auth.role === 'ADMIN');
                const canDelete = !isAdminPreset && (isOwner || auth.role === 'ADMIN');

                const canToggleScope = !isAdminPreset && isOwner;

                return (
                  <tr key={p.id}>
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-900">{p.name}</div>
                      <div className="text-[11px] text-gray-500">ID: {p.id}</div>
                      {isOwner ? (
                        <div className="mt-1">
                          <Badge variant="secondary" className="rounded-full">
                            Mine
                          </Badge>
                        </div>
                      ) : null}
                    </td>

                    <td className="px-5 py-4 text-[11px] text-gray-700">{scopeBadge(scope)}</td>

                    <td className="px-5 py-4 text-[11px] text-gray-700">{p.lines?.length ?? 0}</td>

                    <td className="px-5 py-4 text-[11px] text-gray-700">
                      {(p.tags ?? []).length > 0 ? (p.tags ?? []).join(', ') : '—'}
                    </td>

                    <td className="px-5 py-4 text-[11px] text-gray-700">
                      {formatWhen(getCreatedAtFromPreset(p))}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button asChild variant="outline" className="h-8 rounded-xl px-3 text-xs">
                          <Link href={`/doctor/rx-presets/${p.id}/view`}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </Link>
                        </Button>

                        {!isAdminPreset ? (
                          <>
                            {canEdit ? (
                              <Button
                                asChild
                                variant="secondary"
                                className="h-8 rounded-xl px-3 text-xs"
                              >
                                <Link href={`/doctor/rx-presets/${p.id}`}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit
                                </Link>
                              </Button>
                            ) : null}

                            {canToggleScope && isPrivate ? (
                              <Button
                                variant="secondary"
                                className="h-8 rounded-xl px-3 text-xs"
                                onClick={() => onMakePublic(p.id, p.name)}
                                disabled={updateState.isLoading}
                                title="Make this preset visible to all doctors"
                              >
                                Make Public
                              </Button>
                            ) : null}

                            {canToggleScope && isPublic ? (
                              <Button
                                variant="secondary"
                                className="h-8 rounded-xl px-3 text-xs"
                                onClick={() => onMakePrivate(p.id, p.name)}
                                disabled={updateState.isLoading}
                                title="Make this preset visible only to you"
                              >
                                Make Private
                              </Button>
                            ) : null}

                            {canDelete ? (
                              <Button
                                variant="destructive"
                                className="h-8 rounded-xl px-3 text-xs"
                                onClick={() => onDelete(p.id, p.name)}
                                disabled={deleteState.isLoading}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(list.isError || deleteState.isError || updateState.isError) && (
          <div className="px-5 py-3 text-[11px] text-red-600">
            Something failed. Check network tab / API logs.
          </div>
        )}
      </Card>
    </div>
  );
}
