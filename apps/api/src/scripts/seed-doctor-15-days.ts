// import '../scripts/load-env';
// import { randomUUID } from 'node:crypto';
// import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

// import { dynamoClient, TABLE_NAME } from '../config/aws';
// import { patientRepository } from '../repositories/patientRepository';
// import type { Visit, VisitStatus, VisitTag } from '@dms/types';

// const DOCTOR_ID = '41fb7b06-c9b4-413e-b660-fd521e21dc25';
// const DAYS_BACK = 15;
// const VISITS_MIN = 6;
// const VISITS_MAX = 12;

// const VISIT_TAGS: VisitTag[] = ['N', 'F', 'Z'];

// const REASONS = [
//   'Routine check-up',
//   'Follow-up consultation',
//   'Tooth pain evaluation',
//   'Cleaning and scaling',
//   'Post-op review',
//   'Sensitivity complaint',
//   'Orthodontic adjustment',
// // ];

// const docClient = DynamoDBDocumentClient.from(dynamoClient, {
//   marshallOptions: { removeUndefinedValues: true },
// });

// const toDateString = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// const buildPatientVisitKeys = (patientId: string, visitId: string) => ({
//   PK: `PATIENT#${patientId}`,
//   SK: `VISIT#${visitId}`,
// });

// const buildVisitMetaKeys = (visitId: string) => ({
//   PK: `VISIT#${visitId}`,
//   SK: 'META',
// });

// const buildGsi2keys = (doctorId: string, date: string, status: VisitStatus, ts: number) => ({
//   GSI2PK: `DOCTOR#${doctorId}#DATE#${date}`,
//   GSI2SK: `STATUS#${status}#TS#${ts}`,
// });

// const buildGsi3Keys = (date: string, visitId: string) => ({
//   GSI3PK: `DATE#${date}`,
//   GSI3SK: `TYPE#VISIT#ID#${visitId}`,
// });

// const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// function statusForDay(dayOffset: number, index: number, total: number): VisitStatus {
//   if (dayOffset > 0) return 'DONE';

//   if (index === 0) return 'IN_PROGRESS';

//   const queuedCutoff = Math.max(2, Math.floor(total * 0.4));
//   if (index <= queuedCutoff) return 'QUEUED';

//   return 'DONE';
// }

// async function ensurePatients(count = 20) {
//   console.log(`Ensuring ${count} demo patients...`);

//   const patients = [];

//   for (let i = 0; i < count; i++) {
//     const patient = await patientRepository.create({
//       name: `Demo Patient ${i + 1}`,
//       phone: `900000${String(1000 + i).slice(-4)}`,
//       gender: i % 2 === 0 ? 'male' : 'female',
//     });

//     patients.push({
//       patientId: patient.patientId,
//       name: patient.name,
//     });
//   }

//   return patients;
// }

// async function putVisit(args: {
//   doctorId: string;
//   patient: { patientId: string; name: string };
//   status: VisitStatus;
//   tag: VisitTag;
//   reason: string;
//   dayOffset: number;
//   order: number;
// }) {
//   const { doctorId, patient, status, tag, reason, dayOffset, order } = args;

//   const base = new Date();
//   base.setHours(10, 0, 0, 0);

//   const ts = base.getTime() - dayOffset * 24 * 60 * 60 * 1000 + order * 60_000;
//   const visitDate = toDateString(ts);
//   const visitId = randomUUID();

//   const visit: Visit = {
//     visitId,
//     patientId: patient.patientId,
//     doctorId,
//     reason,
//     status,
//     visitDate,
//     createdAt: ts,
//     updatedAt: ts,
//     tag,
//   };

//   await docClient.send(
//     new PutCommand({
//       TableName: TABLE_NAME,
//       Item: {
//         ...buildPatientVisitKeys(patient.patientId, visitId),
//         entityType: 'PATIENT_VISIT',
//         ...visit,
//       },
//     }),
//   );

//   await docClient.send(
//     new PutCommand({
//       TableName: TABLE_NAME,
//       Item: {
//         ...buildVisitMetaKeys(visitId),
//         entityType: 'VISIT',
//         ...visit,
//         ...buildGsi2keys(doctorId, visitDate, status, ts),
//         ...buildGsi3Keys(visitDate, visitId),
//       },
//     }),
//   );
// }

// async function seedVisitsForDoctor(patients: { patientId: string; name: string }[]) {
//   console.log(`Seeding ${DAYS_BACK} days of visits for doctor ${DOCTOR_ID}...`);

//   for (let day = 0; day < DAYS_BACK; day++) {
//     const visitsToday = rand(VISITS_MIN, VISITS_MAX);
//     let order = 0;

//     for (let i = 0; i < visitsToday; i++) {
//       const patient = pick(patients);

//       await putVisit({
//         doctorId: DOCTOR_ID,
//         patient,
//         status: statusForDay(day, i, visitsToday),
//         tag: pick(VISIT_TAGS),
//         reason: `${patient.name} – ${pick(REASONS)}`,
//         dayOffset: day,
//         order: order++,
//       });
//     }
//   }
// }

// async function main() {
//   console.log('Seeding doctor dashboard (15-day history)...');

//   const patients = await ensurePatients(20);
//   await seedVisitsForDoctor(patients);

//   console.log('✅ Doctor dashboard seed completed.');
// }

// main().catch((err) => {
//   console.error('❌ Seed failed:', err);
//   process.exit(1);
// });
