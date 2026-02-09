import type { RxLineType } from '@dcm/types';

export interface PrescriptionSummaryItem {
  medicine: string;
  lineCount: number;
  quantities: string[];
  uniqueQuantities: string[];
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
      quantities: string[];
    }
  >();

  for (const line of lines) {
    const key = line.medicine.trim().toLowerCase();
    const qty = typeof line.quantity === 'string' ? line.quantity.trim() : '';

    if (!map.has(key)) {
      map.set(key, {
        displayName: line.medicine,
        lineCount: 1,
        quantities: qty ? [qty] : [],
      });
    } else {
      const entry = map.get(key)!;
      entry.lineCount += 1;
      if (qty) entry.quantities.push(qty);
    }
  }

  const items: PrescriptionSummaryItem[] = Array.from(map.values()).map((entry) => {
    const uniq = Array.from(new Set(entry.quantities.map((q) => q.toLowerCase())));

    // keep original casing of first occurrence for each unique value
    const uniqueQuantities = uniq.map((lower) => {
      const found = entry.quantities.find((q) => q.toLowerCase() === lower);
      return found ?? lower;
    });

    return {
      medicine: entry.displayName,
      lineCount: entry.lineCount,
      quantities: entry.quantities,
      uniqueQuantities,
    };
  });

  return {
    totalLines: lines.length,
    uniqueMedicines: items.length,
    items,
  };
};
