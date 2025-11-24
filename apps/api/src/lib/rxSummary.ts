import type { RxLineType } from '@dms/types';

export interface PrescriptionSummaryItem {
  medicine: string;
  lineCount: number;
  totalDurationDays: number;
  minDurationDays: number;
  maxDurationDays: number;
}

export interface PrescriptionSummary {
  totalLines: number;
  uniqueMedicines: number;
  items: PrescriptionSummaryItem[];
}

export const buildPrescriptionSummary = (lines: RxLineType[]): PrescriptionSummary => {
  const map = new Map<
    string,
    {
      displayName: string;
      lineCount: number;
      totalDuration: number;
      minDuration: number;
      maxDuration: number;
    }
  >();

  for (const line of lines) {
    const key = line.medicine.trim().toLowerCase();
    const duration = line.duration;

    if (!map.has(key)) {
      map.set(key, {
        displayName: line.medicine,
        lineCount: 1,
        totalDuration: duration,
        minDuration: duration,
        maxDuration: duration,
      });
    } else {
      const entry = map.get(key)!;
      entry.lineCount += 1;
      entry.totalDuration += duration;
      entry.minDuration = Math.min(entry.minDuration, duration);
      entry.maxDuration = Math.max(entry.maxDuration, duration);
    }
  }

  const items: PrescriptionSummaryItem[] = Array.from(map.values()).map((entry) => ({
    medicine: entry.displayName,
    lineCount: entry.lineCount,
    totalDurationDays: entry.totalDuration,
    minDurationDays: entry.minDuration,
    maxDurationDays: entry.maxDuration,
  }));

  return {
    totalLines: lines.length,
    uniqueMedicines: items.length,
    items,
  };
};
