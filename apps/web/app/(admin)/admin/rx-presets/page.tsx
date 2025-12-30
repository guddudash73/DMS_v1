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
import { Plus, Search, Trash2, Pencil } from 'lucide-react';

import { useAuth } from '@/src/hooks/useAuth';
import {
  useAdminDeleteRxPresetMutation,
  useAdminListRxPresetsQuery,
  useGetDoctorsQuery,
} from '@/src/store/api';

import type { RxPresetFilter } from '@dms/types';

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

type SourceLabel = 'INLINE_DOCTOR' | 'ADMIN_IMPORT';

export default function AdminRxPresetsPage() {
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const [filter, setFilter] = useState<RxPresetFilter>('ALL');

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebounced(query.trim());
      setCursor(undefined);
      setCursorStack([]);
    }, 300);
    return () => window.clearTimeout(t);
  }, [query, filter]);

  const PAGE_SIZE = 20;

  const list = useAdminListRxPresetsQuery(
    { query: debounced || undefined, limit: PAGE_SIZE, cursor },
    { skip: !canUseApi },
  );

  const [deleteRxPreset, deleteState] = useAdminDeleteRxPresetMutation();

  const doctorsQ = useGetDoctorsQuery(undefined, { skip: !canUseApi });
  const doctorNameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of doctorsQ.data ?? []) {
      const id = (d as any).userId ?? (d as any).doctorId ?? (d as any).id;
      const name =
        (d as any).displayName ?? (d as any).fullName ?? (d as any).name ?? (d as any).email;
      if (typeof id === 'string' && typeof name === 'string') map.set(id, name);
    }
    return map;
  }, [doctorsQ.data]);

  const resolveCreatedByAndSource = (createdByUserId?: string) => {
    if (!createdByUserId) return { createdBy: 'Admin', source: 'ADMIN_IMPORT' as SourceLabel };

    const doctorName = doctorNameByUserId.get(createdByUserId);
    if (doctorName) return { createdBy: doctorName, source: 'INLINE_DOCTOR' as SourceLabel };

    return { createdBy: 'Admin', source: 'ADMIN_IMPORT' as SourceLabel };
  };

  const rawItems = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const nextCursor = list.data?.nextCursor ?? null;

  const items = useMemo(() => {
    if (filter === 'ALL') return rawItems;

    return rawItems.filter((p: any) => {
      const scope = p?.scope as string | undefined;

      if (filter === 'ADMIN') return scope === 'ADMIN';
      if (filter === 'PUBLIC') return scope === 'PUBLIC';
      if (filter === 'MINE')
        return Boolean(p?.createdByUserId) && p.createdByUserId === auth.userId;

      return true;
    });
  }, [rawItems, filter, auth.userId]);

  const showing = items.length;

  const canPrev = cursorStack.length > 0;
  const canNext = !!nextCursor;

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
          <Link href="/admin/rx-presets/new">
            <Plus className="mr-2 h-4 w-4" />
            New Preset
          </Link>
        </Button>
      </div>
    );
  }, [query, filter]);

  const onNext = () => {
    if (!nextCursor) return;
    setCursorStack((s) => [...s, cursor]);
    setCursor(nextCursor);
  };

  const onPrev = () => {
    setCursorStack((s) => {
      const copy = [...s];
      const prev = copy.pop();
      setCursor(prev);
      return copy;
    });
  };

  const onDelete = async (id: string, name: string) => {
    const ok = window.confirm(`Delete preset "${name}"? This cannot be undone.`);
    if (!ok) return;
    await deleteRxPreset({ id }).unwrap();
  };

  return (
    <div className="p-4 2xl:p-12">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Rx Presets</h2>
          <p className="mt-1 text-sm text-gray-600">Manage multi-line prescription templates.</p>
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
              Showing:{' '}
              <span className="font-medium text-gray-700">{canUseApi ? showing : '—'}</span>
              <span className="mx-2">·</span>
              Total: <span className="font-medium text-gray-700">{canUseApi ? total : '—'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="h-9 rounded-xl"
              onClick={onPrev}
              disabled={!canPrev || list.isFetching}
            >
              Prev
            </Button>
            <Button
              variant="secondary"
              className="h-9 rounded-xl"
              onClick={onNext}
              disabled={!canNext || list.isFetching}
            >
              Next
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-[11px] font-semibold text-gray-600">
              <tr>
                <th className="px-5 py-3">Preset</th>
                <th className="px-5 py-3">Scope</th>
                <th className="px-5 py-3">Lines</th>
                <th className="px-5 py-3">Tags</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Created by</th>
                <th className="px-5 py-3">Created at</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {!canUseApi && (
                <tr className="text-gray-500">
                  <td className="px-5 py-4" colSpan={8}>
                    Please log in as admin to view presets.
                  </td>
                </tr>
              )}

              {canUseApi && list.isLoading && (
                <tr className="text-gray-500">
                  <td className="px-5 py-4" colSpan={8}>
                    Loading…
                  </td>
                </tr>
              )}

              {canUseApi && !list.isLoading && items.length === 0 && (
                <tr className="text-gray-500">
                  <td className="px-5 py-4" colSpan={8}>
                    No presets found.
                  </td>
                </tr>
              )}

              {items.map((p: any) => {
                const meta = resolveCreatedByAndSource(p.createdByUserId);
                const scope = (p?.scope as string | undefined) ?? 'PRIVATE';

                return (
                  <tr key={p.id}>
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-900">{p.name}</div>
                      <div className="text-[11px] text-gray-500">ID: {p.id}</div>
                    </td>

                    <td className="px-5 py-4 text-[11px] text-gray-700">{scope}</td>

                    <td className="px-5 py-4 text-[11px] text-gray-700">{p.lines?.length ?? 0}</td>

                    <td className="px-5 py-4 text-[11px] text-gray-700">
                      {(p.tags ?? []).length > 0 ? (p.tags ?? []).join(', ') : '—'}
                    </td>

                    <td className="px-5 py-4 text-[11px] text-gray-700">{meta.source}</td>

                    <td className="px-5 py-4 text-[11px] text-gray-700">
                      <div className="font-medium text-gray-900">{meta.createdBy}</div>
                    </td>

                    <td className="px-5 py-4 text-[11px] text-gray-700">
                      {formatWhen(p.createdAt)}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button asChild variant="secondary" className="h-8 rounded-xl px-3 text-xs">
                          <Link href={`/admin/rx-presets/${p.id}`}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </Button>

                        <Button
                          variant="destructive"
                          className="h-8 rounded-xl px-3 text-xs"
                          onClick={() => onDelete(p.id, p.name)}
                          disabled={deleteState.isLoading}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(list.isError || deleteState.isError) && (
          <div className="px-5 py-3 text-[11px] text-red-600">
            Something failed. Check network tab / API logs.
          </div>
        )}
      </Card>
    </div>
  );
}
