export const key = {
  patientPK: (patientId: string) => `PATIENT#${patientId}`,
  patientProfileSK: () => `PROFILE`,
  patientVisitSK: (visitId: string) => `VISIT#${visitId}`,

  visitPK: (visitId: string) => `VISIT#${visitId}`,
  visitMetaSK: () => `META`,
  xraySK: (xrayId: string) => `XRAY#${xrayId}`,
  rxSK: (rxId: string) => `RX#${rxId}`,

  userPK: (userId: string) => `USER#${userId}`,
  userProfileSK: () => `PROFILE`,

  auditPK: (auditId: string) => `AUDIT#${auditId}`,
  auditEventSK: (ts: number) => `EVENT#${ts}`,

  gsi1PK_patient: (patientId: string) => `PATIENT#${patientId}`,
  gsi1SK_visitDate: (dateISO: string, visitId: string) => `VISIT_DATE#${dateISO}#VISIT#${visitId}`,

  gsi2PK_doctorDate: (doctorId: string, dateISO: string) => `DOCTOR#${doctorId}#DATE#${dateISO}`,
  gsi2SK_statusTs: (status: 'QUEUED' | 'IN_PROGRESS' | 'DONE', ts: number) =>
    `STATUS#${status}#TS#${ts}`,

  gsi3PK_date: (dateISO: string) => `DATE#${dateISO}`,
  gsi3SK_typeId: (type: 'VISIT' | 'XRAY' | 'RX' | 'FOLLOWUP', id: string) =>
    `TYPE#${type}#ID#${id}`,
} as const;
