import { Router } from 'express';
import { userRepository } from '../repositories/userRepository';

const r = Router();

r.get('/', async (_req, res, next) => {
  try {
    const doctors = await userRepository.listDoctors();

    const result = doctors.map((d) => ({
      doctorId: d.doctorId,
      fullName: d.fullName,
      displayName: d.displayName,
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
