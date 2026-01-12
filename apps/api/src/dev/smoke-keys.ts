import process from 'node:process';
import { key } from '@dcm/types';

function sample() {
  const patientId = '01HYPA';
  const visitId = '01HYVI';
  const xrayId = '01HYXR';
  const rxId = '01HYRX';
  const doctorId = 'DOC001';
  const dateISO = '2025-11-09';
  const ts = 1731043200;

  return {
    patientPK: key.patientPK(patientId),
    patientProfileSK: key.patientProfileSK(),
    patientVisitSK: key.patientVisitSK(visitId),

    visitPK: key.visitPK(visitId),
    visitMetaSK: key.visitMetaSK(),
    xraySK: key.xraySK(xrayId),
    rxSK: key.rxSK(rxId),

    gsi1PK: key.gsi1PK_patient(patientId),
    gsi1SK: key.gsi1SK_visitDate(dateISO, visitId),

    gsi2PK: key.gsi2PK_doctorDate(doctorId, dateISO),
    gsi2SK_Q: key.gsi2SK_statusTs('QUEUED', ts),

    gsi3PK: key.gsi3PK_date(dateISO),
    gsi3SK_VISIT: key.gsi3SK_typeId('VISIT', visitId),
  };
}

const out = sample();
console.log(JSON.stringify(out, null, 2));

const ok =
  out.patientPK.startsWith('PATIENT#') &&
  out.visitPK.startsWith('VISIT#') &&
  out.gsi2PK.startsWith('DOCTOR#') &&
  out.gsi3PK.startsWith('DATE#') &&
  out.gsi1SK.startsWith('VISIT_DATE#') &&
  out.gsi2SK_Q.startsWith('STATUS#QUEUED#TS#') &&
  out.gsi3SK_VISIT.startsWith('TYPE#VISIT#ID#');

process.exitCode = ok ? 0 : 1;
