import { describe, it, expect } from 'vitest';
import { VisitCreate, VisitStatusUpdate, VisitQueueQuery, PatientId } from '@dcm/types';

describe('Visit schemas', () => {
  it('validates Visitcreate payloads', () => {
    const ok = VisitCreate.safeParse({
      patientId: '01HX0000000000000000000000',
      doctorId: '01HX0000000000000000000000',
      reason: 'Routine checkup',
    });
    expect(ok.success).toBe(true);

    const bad = VisitCreate.safeParse({
      patientId: '',
      doctorId: '01HX0000000000000000000000',
      reason: '',
    });
    expect(bad.success).toBe(false);
  });

  it('validates VisitStatusUpdate payloads', () => {
    const ok = VisitStatusUpdate.safeParse({ status: 'IN_PROGRESS' });
    expect(ok.success).toBe(true);

    const bad = VisitStatusUpdate.safeParse({ status: 'UNKNOWN' });
    expect(bad.success).toBe(false);
  });

  it('vilidates VisitQueueQuery', () => {
    const ok = VisitQueueQuery.safeParse({
      doctorId: '01HX0000000000000000000000',
      date: '2025-11-17',
      status: 'QUEUED',
    });
    expect(ok.success).toBe(true);

    const bad = VisitQueueQuery.safeParse({
      doctorId: '01HX0000000000000000000000',
      date: '17-11-2025',
    });
    expect(bad.success).toBe(false);
  });
});
