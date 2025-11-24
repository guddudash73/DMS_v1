import { describe, it, expect } from 'vitest';
import { buildPrescriptionSummary } from '../src/lib/rxSummary';
import type { RxLineType } from '@dms/types';

describe('buildPrescriptionSummary', () => {
  it('groups lines by medicine and aggregates durations', () => {
    const lines: RxLineType[] = [
      {
        medicine: 'Amoxicillin 500mg',
        dose: '500mg',
        frequency: 'BID',
        duration: 5,
        notes: undefined,
        timing: undefined,
      },
      {
        medicine: 'Amoxicillin 500mg',
        dose: '500mg',
        frequency: 'TID',
        duration: 3,
        notes: undefined,
        timing: undefined,
      },
      {
        medicine: 'ibuprofen 400mg',
        dose: '400mg',
        frequency: 'TID',
        duration: 2,
        notes: undefined,
        timing: undefined,
      },
      {
        medicine: 'Ibuprofen 400mg',
        dose: '400mg',
        frequency: 'QID',
        duration: 4,
        notes: undefined,
        timing: undefined,
      },
    ];

    const summary = buildPrescriptionSummary(lines);

    expect(summary.totalLines).toBe(4);
    expect(summary.uniqueMedicines).toBe(2);

    const amox = summary.items.find((i) => i.medicine === 'Amoxicillin 500mg');
    const ibu = summary.items.find((i) => i.medicine.toLowerCase().includes('ibuprofen'));

    expect(amox).toBeDefined();
    expect(amox!.lineCount).toBe(2);
    expect(amox!.totalDurationDays).toBe(8);
    expect(amox!.minDurationDays).toBe(3);
    expect(amox!.maxDurationDays).toBe(5);

    expect(ibu).toBeDefined();
    expect(ibu!.lineCount).toBe(2);
    expect(ibu!.totalDurationDays).toBe(6);
    expect(ibu!.minDurationDays).toBe(2);
    expect(ibu!.maxDurationDays).toBe(4);
  });

  it('handles empty input', () => {
    const summary = buildPrescriptionSummary([]);
    expect(summary.totalLines).toBe(0);
    expect(summary.uniqueMedicines).toBe(0);
    expect(summary.items).toEqual([]);
  });
});
