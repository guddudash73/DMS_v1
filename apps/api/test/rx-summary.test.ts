import { describe, it, expect } from 'vitest';
import { buildPrescriptionSummary } from '../src/lib/rxSummary';
import type { RxLineType } from '@dcm/types';

describe('buildPrescriptionSummary', () => {
  it('groups lines by medicine and aggregates durations', () => {
    const lines: RxLineType[] = [
      {
        medicine: 'Amoxicillin 500mg',
        dose: '500mg',
        frequency: 'BID',
        quantity: '5 Tabs',
        notes: undefined,
        timing: undefined,
      },
      {
        medicine: 'Amoxicillin 500mg',
        dose: '500mg',
        frequency: 'TID',
        quantity: '3 Tabs',
        notes: undefined,
        timing: undefined,
      },
      {
        medicine: 'ibuprofen 400mg',
        dose: '400mg',
        frequency: 'TID',
        quantity: '2 Tabs',
        notes: undefined,
        timing: undefined,
      },
      {
        medicine: 'Ibuprofen 400mg',
        dose: '400mg',
        frequency: 'QID',
        quantity: '4 Tabs',
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
    expect(amox!.quantities).toEqual(['5 Tabs', '3 Tabs']);
    expect(amox!.uniqueQuantities.length).toBe(2);

    expect(ibu).toBeDefined();
    expect(ibu!.lineCount).toBe(2);
    expect(amox!.quantities).toEqual(['4 Tabs', '2 Tabs']);
    expect(amox!.uniqueQuantities.length).toBe(2);
  });

  it('handles empty input', () => {
    const summary = buildPrescriptionSummary([]);
    expect(summary.totalLines).toBe(0);
    expect(summary.uniqueMedicines).toBe(0);
    expect(summary.items).toEqual([]);
  });
});
