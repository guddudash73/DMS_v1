'use client';

import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

import { cn } from '@/lib/utils';

type Props = {
  value?: Date;
  onChange: (next?: Date) => void;
  fromYear?: number;
  toYear?: number;
  disabled?: (date: Date) => boolean;
  className?: string;
};

export default function PatientDobCalendar({
  value,
  onChange,
  fromYear = 1900,
  toYear = new Date().getFullYear(),
  disabled,
  className,
}: Props) {
  return (
    <div
      className={cn(
        // Container styling
        'rounded-2xl border bg-white p-3 shadow-lg',
        // Make react-day-picker look sane with Tailwind base styles
        // (RDP CSS gives layout; these just tweak text/spacing)
        '[&_.rdp]:m-0 [&_.rdp]:p-0',
        '[&_.rdp-caption]:mb-2 [&_.rdp-caption]:justify-center',
        '[&_.rdp-caption_label]:text-sm [&_.rdp-caption_label]:font-semibold',
        '[&_.rdp-nav]:gap-1',
        '[&_.rdp-head_cell]:text-xs [&_.rdp-head_cell]:font-medium [&_.rdp-head_cell]:text-gray-600',
        '[&_.rdp-cell]:p-0',
        '[&_.rdp-day]:h-9 [&_.rdp-day]:w-9 [&_.rdp-day]:rounded-xl',
        '[&_.rdp-day_selected]:bg-black [&_.rdp-day_selected]:text-white',
        '[&_.rdp-day_today]:border [&_.rdp-day_today]:border-gray-300',
        '[&_.rdp-dropdown]:h-9 [&_.rdp-dropdown]:rounded-xl [&_.rdp-dropdown]:border [&_.rdp-dropdown]:px-2',
        className,
      )}
    >
      <DayPicker
        mode="single"
        selected={value}
        onSelect={onChange}
        captionLayout="dropdown"
        fromYear={fromYear}
        toYear={toYear}
        disabled={disabled}
        showOutsideDays
      />
    </div>
  );
}
