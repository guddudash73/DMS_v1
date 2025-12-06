import { Router } from 'express';
import bcrypt from 'bcrypt';
import { validate } from '../middlewares/zod';
import { AdminCreateDoctorRequest, AdminUpdateDoctorRequest } from '@dms/types';
import type { AdminDoctorListItem, DoctorProfile } from '@dms/types';
import { userRepository } from '../repositories/userRepository';
import { logAudit } from '../lib/logger';

const r = Router();

r.post('/', validate(AdminCreateDoctorRequest), async (req, res, next) => {
  try {
    const input = req.body as AdminCreateDoctorRequest;

    const passwordHash = await bcrypt.hash(input.password, 10);

    const baseParams: {
      email: string;
      displayName: string;
      passwordHash: string;
      fullName: string;
      registrationNumber: string;
      specialization: string;
      contact?: string;
    } = {
      email: input.email,
      displayName: input.displayName,
      passwordHash,
      fullName: input.fullName,
      registrationNumber: input.registrationNumber,
      specialization: input.specialization,
    };

    if (input.contact !== undefined) {
      baseParams.contact = input.contact;
    }

    const { user, doctor } = await userRepository.createDoctor(baseParams);

    const result: AdminDoctorListItem = {
      ...doctor,
      email: user.email,
      displayName: user.displayName,
    };

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'ADMIN_CREATE_DOCTOR',
        entity: {
          type: 'USER',
          id: doctor.doctorId,
        },
        meta: {
          email: user.email,
          registrationNumber: doctor.registrationNumber,
        },
      });
    }

    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
});

r.get('/', async (_req, res, next) => {
  try {
    const doctors = await userRepository.listDoctors();

    const result: AdminDoctorListItem[] = doctors.map((d) => ({
      doctorId: d.doctorId,
      fullName: d.fullName,
      registrationNumber: d.registrationNumber,
      specialization: d.specialization,
      contact: d.contact,
      active: d.active,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      email: d.email,
      displayName: d.displayName,
    }));

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

r.patch('/:doctorId', validate(AdminUpdateDoctorRequest), async (req, res, next) => {
  try {
    const doctorId = req.params.doctorId;
    if (!doctorId) {
      return res.status(400).json({
        error: 'INVALID_DOCTOR_ID',
        message: 'Doctor id is required',
        traceId: req.requestId,
      });
    }

    const body = req.body as AdminUpdateDoctorRequest;

    const repoPatch: Partial<Omit<DoctorProfile, 'doctorId' | 'createdAt'>> = {};

    if (body.fullName !== undefined) {
      repoPatch.fullName = body.fullName;
    }
    if (body.registrationNumber !== undefined) {
      repoPatch.registrationNumber = body.registrationNumber;
    }
    if (body.specialization !== undefined) {
      repoPatch.specialization = body.specialization;
    }
    if (body.contact !== undefined) {
      repoPatch.contact = body.contact;
    }
    if (body.active !== undefined) {
      repoPatch.active = body.active;
    }

    const updated = await userRepository.updateDoctorProfile(doctorId, repoPatch);
    if (!updated) {
      return res.status(404).json({
        error: 'DOCTOR_NOT_FOUND',
        message: 'Doctor not found',
        traceId: req.requestId,
      });
    }

    const user = await userRepository.getById(doctorId);
    if (!user) {
      return res.status(500).json({
        error: 'USER_NOT_FOUND_FOR_DOCTOR',
        message: 'User record not found for doctor',
        traceId: req.requestId,
      });
    }

    const result: AdminDoctorListItem = {
      ...updated,
      email: user.email,
      displayName: user.displayName,
    };

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'ADMIN_UPDATE_DOCTOR',
        entity: {
          type: 'USER',
          id: doctorId,
        },
        meta: {
          active: updated.active,
          specialization: updated.specialization,
        },
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

export default r;
