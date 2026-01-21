import * as React from 'react';
import { Card } from '@/components/ui/card';

function Block({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-100 ${className}`} />;
}

export default function Loading() {
  return (
    <section className="p-4 2xl:p-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <Block className="h-6 w-28" />
          <Block className="mt-2 h-4 w-52" />
        </div>

        <div className="flex items-center gap-2">
          <Block className="h-10 w-24 rounded-xl" />
          <Block className="h-10 w-32 rounded-xl" />
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-10">
        <Card className="lg:col-span-6 rounded-2xl border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <Block className="h-5 w-40" />
            <Block className="h-4 w-20" />
          </div>

          <Block className="h-130 w-full rounded-2xl" />
        </Card>

        <Card className="lg:col-span-4 rounded-2xl border bg-white p-4">
          <div className="flex items-center justify-between border-b pb-3">
            <Block className="h-5 w-32" />
          </div>

          <div className="mt-3">
            <Block className="h-72 w-full rounded-2xl" />
          </div>

          <div className="mt-4 space-y-2 rounded-2xl border bg-white p-3">
            <Block className="h-4 w-28" />
            <Block className="h-3 w-56" />
            <Block className="h-20 w-full rounded-xl" />
          </div>

          <div className="mt-4 space-y-2 rounded-2xl border bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Block className="h-4 w-32" />
                <Block className="h-3 w-56" />
              </div>
              <Block className="h-9 w-20 rounded-xl" />
            </div>
            <Block className="h-28 w-full rounded-xl" />
          </div>
        </Card>
      </div>
    </section>
  );
}
