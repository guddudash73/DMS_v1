// apps/web/app/doctor/visits/[visitId]/loading.tsx
import * as React from 'react';
import { Card } from '@/components/ui/card';

function Block({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-100 ${className}`} />;
}

export default function Loading() {
  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <Block className="h-6 w-28" />
          <Block className="mt-2 h-4 w-72" />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Block className="h-10 w-28 rounded-xl" />
          <Block className="h-10 w-24 rounded-xl" />
          <Block className="h-10 w-36 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5 rounded-2xl border bg-white p-6">
          <Block className="h-5 w-40" />
          <div className="mt-4 space-y-3">
            <Block className="h-4 w-full" />
            <Block className="h-4 w-5/6" />
            <Block className="h-4 w-4/6" />
            <Block className="h-4 w-3/6" />
          </div>
        </Card>

        <Card className="lg:col-span-7 rounded-2xl border bg-white p-6">
          <Block className="h-5 w-48" />
          <Block className="mt-4 h-64 w-full rounded-2xl" />
        </Card>
      </div>
    </section>
  );
}
