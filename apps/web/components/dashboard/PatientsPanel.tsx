// apps/web/components/dashboard/PatientsPanel.tsx
'use client';

import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

type PatientTag = 'N' | 'F' | 'Z' | 'O';

type PatientListItem = {
  id: string;
  name: string;
  doctorName: string;
  tag: PatientTag;
  avatarUrl?: string | null;
};

const TAG_META: Record<PatientTag, { label: string; dotClass: string }> = {
  N: { label: 'N', dotClass: 'bg-emerald-500' },
  F: { label: 'F', dotClass: 'bg-pink-500' },
  Z: { label: 'Z', dotClass: 'bg-amber-400' },
  O: { label: 'O', dotClass: 'bg-slate-400' },
};

// TEMP demo data – replace with real data later
const DEMO_PATIENTS: PatientListItem[] = [
  { id: '1', name: 'Guddu Dash', doctorName: 'Dr. Sarangi', tag: 'N' },
  { id: '2', name: 'Guddu Dash', doctorName: 'Dr. Sarangi', tag: 'F' },
  { id: '3', name: 'Guddu Dash', doctorName: 'Dr. Sarangi', tag: 'Z' },
  { id: '4', name: 'Guddu Dash', doctorName: 'Dr. Sarangi', tag: 'N' },
  { id: '5', name: 'Guddu Dash', doctorName: 'Dr. Sarangi', tag: 'F' },
  { id: '6', name: 'Guddu Dash', doctorName: 'Dr. Sarangi', tag: 'O' },
  { id: '7', name: 'Guddu Dash', doctorName: 'Dr. Sarangi', tag: 'N' },
  { id: '8', name: 'Guddu Dash', doctorName: 'Dr. Sarangi', tag: 'F' },
];

type PatientsPanelProps = {
  title?: string;
  patients?: PatientListItem[];
};

export default function PatientsPanel({
  title = 'Patients.',
  patients = DEMO_PATIENTS,
}: PatientsPanelProps) {
  return (
    <Card className="flex h-full flex-col rounded-2xl border-none bg-white pt-4 shadow-sm gap-2">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-1">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 max-h-70 dms-scroll">
        <ul className="space-y-1">
          {patients.map((p) => {
            const tagMeta = TAG_META[p.tag];

            return (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-2xl px-3 py-2 text-xs hover:bg-gray-50"
              >
                {/* Left: avatar + text */}
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    {p.avatarUrl ? (
                      <AvatarImage src={p.avatarUrl} alt={p.name} />
                    ) : (
                      <AvatarFallback>
                        {p.name
                          .split(' ')
                          .map((s) => s[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>

                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-medium text-gray-900">{p.name}</span>

                      {/* tiny grey dot */}
                      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-gray-400" />

                      {/* Tag dot + letter (N/F/Z/O) */}
                      <span className="flex items-center gap-0.5 text-[10px] text-gray-700">
                        <span
                          className={cn('inline-flex h-1.5 w-1.5 rounded-full', tagMeta.dotClass)}
                        />
                        <span>{tagMeta.label}</span>
                      </span>
                    </div>

                    <div className="text-[11px] text-gray-500">{p.doctorName}</div>
                  </div>
                </div>

                {/* Right: small red minus line */}
                <div className="flex items-center justify-center pr-1">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full">
                    <span className="block h-[1.5px] w-3 rounded-full bg-red-500" />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
