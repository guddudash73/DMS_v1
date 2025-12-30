'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Eye, Tag, Pill, Clock, Hash, AlertTriangle, Loader2, Copy } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { useAuth } from '@/src/hooks/useAuth';
import { useGetRxPresetByIdQuery, type ErrorResponse } from '@/src/store/api';

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

function asErrorResponse(data: unknown): ErrorResponse | null {
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
}

function formatLineText(line: any): string {
  const name =
    line?.medicineName ??
    line?.displayName ??
    line?.medicine ??
    line?.drug ??
    line?.name ??
    line?.title ??
    '';

  const dose = line?.dose ?? line?.strength ?? line?.amount ?? '';
  const frequency = line?.frequency ?? line?.freq ?? '';
  const duration = line?.duration ?? line?.days ?? line?.durationDays ?? '';
  const route = line?.route ?? '';
  const notes = line?.notes ?? line?.note ?? line?.instructions ?? line?.sig ?? '';

  const parts: string[] = [];
  if (name) parts.push(String(name).trim());
  if (dose) parts.push(String(dose).trim());
  if (frequency) parts.push(String(frequency).trim());
  if (duration) parts.push(`${String(duration).trim()} days`);
  if (route) parts.push(String(route).trim());

  const headline = parts.filter(Boolean).join(' · ').trim();
  const tail = String(notes ?? '').trim();

  if (headline && tail) return `${headline} — ${tail}`;
  return headline || tail || 'Prescription line';
}

function safeCopy(text: string) {
  try {
    void navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

export default function DoctorRxPresetViewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const auth = useAuth();

  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;
  const id = params?.id;

  const { data, isLoading, isFetching, error } = useGetRxPresetByIdQuery(
    { id: String(id ?? '') },
    { skip: !canUseApi || !id },
  );

  const scope = (data as any)?.scope as string | undefined;

  const lines = useMemo(() => {
    const raw = (data as any)?.lines as any[] | undefined;
    return Array.isArray(raw) ? raw : [];
  }, [data]);

  const tags = useMemo(() => {
    const t = (data as any)?.tags as string[] | undefined;
    return Array.isArray(t) ? t : [];
  }, [data]);

  const copyAllText = useMemo(() => {
    const title = data?.name ? `${data.name}\n` : '';
    const list = lines
      .map((l, idx) => `${idx + 1}. ${formatLineText(l)}`)
      .join('\n')
      .trim();
    return `${title}${list}`.trim();
  }, [data?.name, lines]);

  const errorMessage = useMemo(() => {
    const e = error as any;
    const maybe = asErrorResponse(e?.data);
    return maybe?.message ?? (typeof maybe?.error === 'string' ? maybe.error : null);
  }, [error]);

  if (!canUseApi) {
    return (
      <div className="p-6">
        <Card className="rounded-3xl border bg-white p-6 text-sm text-gray-700">
          Please log in to view this preset.
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mx-auto w-full max-w-4xl 2xl:px-6">
        {/* Top bar */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              className="h-9 rounded-2xl"
              onClick={() => router.replace('/doctor/rx-presets')}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Eye className="h-4 w-4 text-gray-500" />
              <span className="font-semibold text-gray-900">View Preset</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-2xl"
              onClick={() => safeCopy(copyAllText)}
              disabled={!copyAllText}
              title="Copy preset lines"
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>

            <Button asChild className="h-9 rounded-2xl">
              <Link href="/doctor/rx-presets/new">Create New</Link>
            </Button>
          </div>
        </div>

        {/* Header card */}
        <Card className="rounded-3xl border bg-white p-0">
          <div className="border-b px-6 py-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-xl font-semibold text-gray-900">
                    {isLoading || isFetching ? 'Loading…' : (data?.name ?? 'Rx Preset')}
                  </div>
                  {scopeBadge(scope)}
                  {(isLoading || isFetching) && (
                    <Badge variant="secondary" className="rounded-full">
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      Fetching
                    </Badge>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                  <span className="inline-flex items-center gap-1">
                    <Hash className="h-3.5 w-3.5 text-gray-400" />
                    <span className="font-mono">{String(id ?? '')}</span>
                  </span>

                  <span className="inline-flex items-center gap-1">
                    <Pill className="h-3.5 w-3.5 text-gray-400" />
                    {lines.length} lines
                  </span>

                  {tags.length > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Tag className="h-3.5 w-3.5 text-gray-400" />
                      {tags.join(', ')}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* subtle right-side hint */}
              <div className="rounded-2xl bg-gray-50 px-4 py-3 text-xs text-gray-700">
                <div className="font-semibold text-gray-900">Tip</div>
                <div className="mt-1 text-gray-600">
                  Use <span className="font-semibold">Copy</span> to quickly paste these lines into
                  notes or chat.
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          {error ? (
            <div className="px-6 py-10">
              <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-red-800">Unable to load preset</div>
                  <div className="mt-1 text-sm text-red-700">
                    {errorMessage ?? 'Please check API logs / network tab.'}
                  </div>
                </div>
              </div>
            </div>
          ) : isLoading && !data ? (
            <div className="px-6 py-10">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading preset…
              </div>
            </div>
          ) : lines.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-600">
              This preset has no lines.
            </div>
          ) : (
            <div className="px-6 py-6">
              <div className="grid gap-3">
                {lines.map((line, idx) => {
                  const headline = formatLineText(line);

                  const name =
                    line?.medicineName ??
                    line?.displayName ??
                    line?.medicine ??
                    line?.drug ??
                    line?.name ??
                    '';

                  const freq = line?.frequency ?? line?.freq ?? '';
                  const dur = line?.duration ?? line?.days ?? line?.durationDays ?? '';

                  return (
                    <div
                      key={idx}
                      className="group relative overflow-hidden rounded-3xl border bg-white p-4 shadow-sm"
                    >
                      {/* left accent */}
                      <div className="absolute left-0 top-0 h-full w-1 bg-gray-900/10" />

                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="rounded-full">
                              #{idx + 1}
                            </Badge>
                            {name ? (
                              <div className="truncate text-base font-semibold text-gray-900">
                                {String(name)}
                              </div>
                            ) : (
                              <div className="truncate text-base font-semibold text-gray-900">
                                Prescription Line
                              </div>
                            )}
                          </div>

                          <div className="mt-2 text-sm text-gray-700">{headline}</div>

                          {/* compact metadata row */}
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                            {freq ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-1">
                                <Clock className="h-3.5 w-3.5 text-gray-400" />
                                {String(freq)}
                              </span>
                            ) : null}
                            {dur ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-1">
                                <Clock className="h-3.5 w-3.5 text-gray-400" />
                                {String(dur)} days
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 rounded-2xl opacity-100 md:opacity-0 md:group-hover:opacity-100"
                            onClick={() => safeCopy(`${idx + 1}. ${headline}`)}
                            title="Copy this line"
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Copy line
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="mt-6 flex flex-col gap-2 rounded-3xl bg-gray-50 p-5 text-xs text-gray-700 md:flex-row md:items-center md:justify-between">
                <div className="text-gray-600">Want to use this preset as a starting point?</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    className="h-9 rounded-2xl"
                    onClick={() => safeCopy(copyAllText)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy all
                  </Button>
                  <Button asChild className="h-9 rounded-2xl">
                    <Link href="/doctor/rx-presets/new">Create your own</Link>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
