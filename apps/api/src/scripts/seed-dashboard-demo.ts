// import '../scripts/load-env';
// import bcrypt from 'bcrypt';
// import { randomUUID } from 'node:crypto';

// import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

// import { dynamoClient, TABLE_NAME } from '../config/aws';
// import { userRepository } from '../repositories/userRepository';
// import { patientRepository } from '../repositories/patientRepository';
// import type { Visit, VisitStatus, VisitTag } from '@dms/types';

// const docClient = DynamoDBDocumentClient.from(dynamoClient, {
//   marshallOptions: { removeUndefinedValues: true },
// });

// const toDateString = (timestampMs: number): string =>
//   new Date(timestampMs).toISOString().slice(0, 10);

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

// type Gender = 'male' | 'female';

// interface DemoPatientSeed {
//   name: string;
//   gender: Gender;
//   phone: string;
// }

// const demoPatients: DemoPatientSeed[] = [
//   { name: 'Ankita Sharma', gender: 'female', phone: '9000000001' },
//   { name: 'Priya Iyer', gender: 'female', phone: '9000000002' },
//   { name: 'Neha Kulkarni', gender: 'female', phone: '9000000003' },
//   { name: 'Asha Reddy', gender: 'female', phone: '9000000004' },

//   { name: 'Ravi Patel', gender: 'male', phone: '9000000005' },
//   { name: 'Sanjay Verma', gender: 'male', phone: '9000000006' },
//   { name: 'Arjun Mehta', gender: 'male', phone: '9000000007' },
//   { name: 'Vikram Singh', gender: 'male', phone: '9000000008' },

//   { name: 'Meera Nair', gender: 'female', phone: '9000000009' },
//   { name: 'Kiran Das', gender: 'male', phone: '9000000010' },
//   { name: 'Swati Joshi', gender: 'female', phone: '9000000011' },
//   { name: 'Rohit Kulkarni', gender: 'male', phone: '9000000012' },
// ];

// interface VisitTemplate {
//   idx: number;
//   tag: VisitTag;
//   status: VisitStatus;
//   description: string;
// }

// const todayTemplates: VisitTemplate[] = [
//   {
//     idx: 0,
//     tag: 'N',
//     status: 'DONE',
//     description: 'First-time consultation (completed)',
//   },
//   {
//     idx: 1,
//     tag: 'F',
//     status: 'IN_PROGRESS',
//     description: 'Ongoing root-canal treatment',
//   },
//   {
//     idx: 2,
//     tag: 'F',
//     status: 'QUEUED',
//     description: 'Follow-up on tooth sensitivity',
//   },
//   {
//     idx: 3,
//     tag: 'Z',
//     status: 'QUEUED',
//     description: 'Post-op checkup (no charge)',
//   },
// ];

// const yesterdayTemplates: VisitTemplate[] = [
//   {
//     idx: 4,
//     tag: 'Z',
//     status: 'DONE',
//     description: 'Suture removal (no charge)',
//   },
//   {
//     idx: 5,
//     tag: 'F',
//     status: 'IN_PROGRESS',
//     description: 'Aligner review appointment',
//   },
//   {
//     idx: 0,
//     tag: 'N',
//     status: 'QUEUED',
//     description: 'New patient – wisdom tooth pain',
//   },
//   {
//     idx: 1,
//     tag: 'F',
//     status: 'QUEUED',
//     description: 'Periodic cleaning visit',
//   },
// ];

// const perDoctorPatients: Record<'d1' | 'd2' | 'd3', number[]> = {
//   d1: [0, 1, 4, 5, 8, 9],
//   d2: [2, 3, 6, 7, 10, 11],
//   d3: [1, 4, 7, 8, 9, 10],
// };

// async function seedDoctors() {
//   console.log('\nCreating doctors...');

//   const passwordHash = await bcrypt.hash('DoctorPass123!', 10);

//   const d1 = await userRepository.createDoctor({
//     email: 'dr.sarangi@example.com',
//     displayName: 'Dr Sarangi',
//     passwordHash,
//     fullName: 'Dr. S. Sarangi',
//     registrationNumber: 'ODDC-001',
//     specialization: 'Endodontics',
//     contact: '+91 90000 11111',
//   });

//   const d2 = await userRepository.createDoctor({
//     email: 'dr.panda@example.com',
//     displayName: 'Dr Panda',
//     passwordHash,
//     fullName: 'Dr. A. Panda',
//     registrationNumber: 'ODDC-002',
//     specialization: 'Orthodontics',
//     contact: '+91 90000 22222',
//   });

//   const d3 = await userRepository.createDoctor({
//     email: 'dr.mishra@example.com',
//     displayName: 'Dr Mishra',
//     passwordHash,
//     fullName: 'Dr. R. Mishra',
//     registrationNumber: 'ODDC-003',
//     specialization: 'Prosthodontics',
//     contact: '+91 90000 33333',
//   });

//   const ids = {
//     d1: d1.doctor.doctorId,
//     d2: d2.doctor.doctorId,
//     d3: d3.doctor.doctorId,
//   };

//   console.log('Doctors created:', ids);
//   return ids;
// }

// async function seedPatients() {
//   console.log('Creating patients...');

//   const created: { patientId: string; name: string }[] = [];

//   for (const p of demoPatients) {
//     const patient = await patientRepository.create({
//       name: p.name,
//       phone: p.phone,
//       gender: p.gender,
//     });

//     created.push({ patientId: patient.patientId, name: patient.name });
//   }

//   console.log('Patients created:', created.length);
//   return created;
// }

// async function putVisitDirect(args: {
//   doctorId: string;
//   patient: { patientId: string; name: string };
//   status: VisitStatus;
//   tag: VisitTag;
//   description: string;
//   dayOffset: number;
//   order: number;
// }) {
//   const { doctorId, patient, status, tag, description, dayOffset, order } = args;

//   const base = new Date();
//   base.setHours(10, 0, 0, 0);
//   const msPerDay = 24 * 60 * 60 * 1000;
//   const ts = base.getTime() - dayOffset * msPerDay + order * 60_000;

//   const visitDate = toDateString(ts);
//   const visitId = randomUUID();
//   const reason = `${patient.name} – ${description}`;

//   const baseVisit: Visit = {
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

//   const patientItem = {
//     ...buildPatientVisitKeys(patient.patientId, visitId),
//     entityType: 'PATIENT_VISIT',
//     ...baseVisit,
//   };

//   const metaItem = {
//     ...buildVisitMetaKeys(visitId),
//     entityType: 'VISIT',
//     ...baseVisit,
//     ...buildGsi2keys(doctorId, visitDate, status, ts),
//     ...buildGsi3Keys(visitDate, visitId),
//   };

//   await docClient.send(
//     new PutCommand({
//       TableName: TABLE_NAME,
//       Item: patientItem,
//     }),
//   );

//   await docClient.send(
//     new PutCommand({
//       TableName: TABLE_NAME,
//       Item: metaItem,
//     }),
//   );
// }

// async function seedVisits(
//   doctors: { d1: string; d2: string; d3: string },
//   patients: { patientId: string; name: string }[],
// ) {
//   console.log('Creating visits...');

//   const doctorMap: Record<string, number[]> = {
//     [doctors.d1]: perDoctorPatients.d1,
//     [doctors.d2]: perDoctorPatients.d2,
//     [doctors.d3]: perDoctorPatients.d3,
//   };

//   const pickPatient = (idxPool: number[], idx: number) => {
//     const realIndex = idxPool[idx % idxPool.length];
//     return patients[realIndex];
//   };

//   for (const [doctorId, idxPool] of Object.entries(doctorMap)) {
//     console.log(`\n--- Doctor ${doctorId} ---`);

//     let order = 0;
//     for (const tmpl of todayTemplates) {
//       const patient = pickPatient(idxPool, tmpl.idx);
//       await putVisitDirect({
//         doctorId,
//         patient,
//         status: tmpl.status,
//         tag: tmpl.tag,
//         description: tmpl.description,
//         dayOffset: 0,
//         order: order++,
//       });
//     }

//     order = 0;
//     for (const tmpl of yesterdayTemplates) {
//       const patient = pickPatient(idxPool, tmpl.idx);
//       await putVisitDirect({
//         doctorId,
//         patient,
//         status: tmpl.status,
//         tag: tmpl.tag,
//         description: tmpl.description,
//         dayOffset: 1,
//         order: order++,
//       });
//     }
//   }
// }

// async function main() {
//   console.log('Seeding dashboard demo data...');

//   const doctors = await seedDoctors();
//   const patients = await seedPatients();
//   await seedVisits(doctors, patients);

//   console.log('\n[seed-dashboard-demo] done.');
// }

// main().catch((err) => {
//   console.error('Fatal Seed Error:', err);
//   process.exit(1);
// });
