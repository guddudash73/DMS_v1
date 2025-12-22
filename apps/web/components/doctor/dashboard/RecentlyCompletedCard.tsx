'use client';

import { Card } from '@/components/ui/card';
import { useAuth } from '@/src/hooks/useAuth';
import { useGetDoctorRecentCompletedQuery } from '@/src/store/api';
import { FileText, Image as ImageIcon } from 'lucide-react';

function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const ROWS = 5;

export default function RecentlyCompletedCard() {
  const auth = useAuth();
  const canUseApi = auth.status === 'authenticated' && !!auth.accessToken;

  const todayIso = getTodayIso();

  const { data, isLoading, isFetching, isError } = useGetDoctorRecentCompletedQuery(
    { date: todayIso, limit: ROWS },
    { skip: !canUseApi },
  );

  const showDots = isLoading || isFetching;
  const items = data?.items ?? [];

  const rows = Array.from({ length: ROWS }).map((_, i) => items[i] ?? null);

  return (
    <Card className="w-full rounded-2xl border-none bg-white px-6 py-4 shadow-sm gap-2">
      <h3 className="text-lg font-semibold text-gray-900">Recently Completed</h3>
      <p className="text-xs text-gray-400">Last 5 completed visits (today).</p>

      <div className="mt-4 overflow-hidden rounded-xl border bg-white">
        <div className="grid grid-cols-[1fr_64px_64px] bg-gray-50 px-3 py-3 text-[11px] font-semibold text-gray-600">
          <div>Patient</div>
          <div className="text-center">Rx</div>
          <div className="text-center">X-ray</div>
        </div>

        <div className="divide-y">
          {isError && !showDots ? (
            <div className="px-3 py-3 text-xs text-red-500">Couldn&apos;t load recent visits.</div>
          ) : (
            rows.map((row, idx) => {
              const isPlaceholder = row === null;

              return (
                <div
                  key={row?.visitId ?? `placeholder-${idx}`}
                  className="grid h-8 grid-cols-[1fr_64px_64px] items-center px-3 text-xs"
                >
                  <div className="truncate text-gray-900">
                    {showDots ? (
                      <span className="inline-block h-3 w-36 rounded bg-gray-100" />
                    ) : isPlaceholder ? (
                      <span className="text-gray-300">—</span>
                    ) : (
                      row.patientName
                    )}
                  </div>

                  <div className="flex justify-center">
                    {showDots ? (
                      <span className="inline-block h-3 w-3 rounded bg-gray-100" />
                    ) : isPlaceholder ? (
                      <span className="text-gray-300">—</span>
                    ) : row.hasRx ? (
                      <FileText
                        className="h-4 w-4 text-gray-700"
                        aria-label="Prescription exists"
                      />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </div>

                  <div className="flex justify-center">
                    {showDots ? (
                      <span className="inline-block h-3 w-3 rounded bg-gray-100" />
                    ) : isPlaceholder ? (
                      <span className="text-gray-300">—</span>
                    ) : row.hasXray ? (
                      <ImageIcon className="h-4 w-4 text-gray-700" aria-label="X-ray exists" />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!showDots && !isError && items.length === 0 && (
          <div className="border-t bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
            No completed visits yet today.
          </div>
        )}
      </div>

      {!canUseApi && (
        <p className="mt-4 text-xs text-gray-400">Please log in to view recent completed visits.</p>
      )}
    </Card>
  );
}
