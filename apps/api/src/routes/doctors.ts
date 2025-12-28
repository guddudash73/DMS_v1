// apps/api/src/routes/doctors.ts
import { Router } from 'express';
import { userRepository } from '../repositories/userRepository';

const r = Router();

/**
 * GET /doctors
 * Public-ish doctor list for authenticated roles (DOCTOR/RECEPTION/ADMIN).
 * Returns minimal info required by UI to resolve doctorId -> name.
 */
r.get('/', async (_req, res, next) => {
  try {
    const doctors = await userRepository.listDoctors();

    const result = doctors.map((d) => ({
      doctorId: d.doctorId,
      fullName: d.fullName,
      displayName: d.displayName, // comes from user record in repository join
      specialization: d.specialization,
      registrationNumber: d.registrationNumber,
      contact: d.contact,
      active: d.active,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

export default r;
