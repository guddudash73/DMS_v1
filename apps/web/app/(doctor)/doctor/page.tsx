'use client';

import DoctorQueueCard from '@/components/doctor/dashboard/DoctorQueueCard';

export default function DoctorDashboardPage() {
  return (
    <section className="h-full px-3 py-4 md:px-6 md:py-6 2xl:px-10 2xl:py-10">
      <div className="grid h-full grid-cols-1 gap-6 2xl:gap-10 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,3fr)]">
        {/* Left column */}
        <div className="flex flex-col gap-6 2xl:gap-10">
          <DoctorQueueCard />
          {/* Next: Queue Summary card will go here */}
        </div>

        {/* Right column */}
        <div className="flex h-full flex-col gap-6 2xl:gap-10">
          {/* Next: Visitors chart card */}
          {/* Next: Recent visits table */}
          <div className="flex h-full items-center justify-center rounded-2xl bg-white shadow-sm">
            <div className="text-center text-sm text-gray-500">Right-side cards coming next…</div>
          </div>
        </div>
      </div>
    </section>
  );
}
