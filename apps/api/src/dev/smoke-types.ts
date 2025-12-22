import process from 'node:process';
import {
  Patient,
  Visit,
  VisitStatus,
  Xray,
  Prescription,
  RxLine,
  User,
  Role,
  AuditEvent,
} from '@dms/types';

function assertOk(label: string, ok: boolean, msg?: string) {
  if (!ok) {
    console.error(JSON.stringify({ smoke: label, ok, msg }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ smoke: label, ok }, null, 2));
  }
}

try {
  const patientOk = Patient.safeParse({
    patientId: '01HYTESTPATIENT',
    name: 'Asha Rao',
    phone: '+91-99999-12345',
    dob: '1990-05-11',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }).success;
  assertOk('Patient', patientOk);

  const visitOk = Visit.safeParse({
    visitId: '01HYTESTVISIT',
    patientId: '01HYTESTPATIENT',
    doctorId: 'DOC001',
    reason: 'Cleaning',
    status: VisitStatus.enum.QUEUED,
    visitDate: new Date().toISOString().slice(0, 10),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }).success;
  assertOk('Visit', visitOk);

  {
    const candidate = {
      xrayId: '01J5Z4F8S9X4Z7W3R8K2C1V6AB',
      visitId: '01J5Z4F8S9X4Z7W3R8K2C1V6AC',
      contentKey: 'xray/01J5Z4F8S9X4Z7W3R8K2C1V6AC/01J5Z4F8S9X4Z7W3R8K2C1V6AB.jpg',
      contentType: 'image/jpeg',
      size: 1024,
      createdAt: Date.now(),
    };
    const parsed = Xray.safeParse(candidate);
    if (!parsed.success) {
      console.error(
        JSON.stringify(
          { smoke: 'Xray', ok: false, issues: parsed.error.issues, input: candidate },
          null,
          2,
        ),
      );
    }
    assertOk('Xray', parsed.success);
  }

  const rxLineOk = RxLine.safeParse({
    medicine: 'Amoxicillin',
    dose: '500mg',
    frequency: 'BID',
    durationDays: 5,
  }).success;
  assertOk('RxLine', rxLineOk);

  const rxOk = Prescription.safeParse({
    rxId: '01HYRX',
    visitId: '01HYTESTVISIT',
    lines: [
      {
        medicine: 'Ibuprofen',
        dose: '400mg',
        frequency: 'TID',
        durationDays: 3,
      },
    ],
    version: 1,
    jsonKey: 'rx/01HYTESTVISIT/01HYRX.json',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }).success;
  assertOk('Prescription', rxOk);

  const userOk = User.safeParse({
    userId: 'USER001',
    email: 'doctor@example.com',
    displayName: 'Dr. Sharma',
    role: Role.enum.DOCTOR,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }).success;
  assertOk('User', userOk);

  const auditOk = AuditEvent.safeParse({
    auditId: 'AUD001',
    actorUserId: 'USER001',
    action: 'VISIT_STATUS_CHANGED',
    entity: { type: 'VISIT', id: '01HYTESTVISIT' },
    meta: { from: 'QUEUED', to: 'IN_PROGRESS' },
    ts: Date.now(),
  }).success;
  assertOk('AuditEvent', auditOk);
} catch (err) {
  console.error({ err });
  process.exitCode = 1;
}
