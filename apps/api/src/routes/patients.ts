import express, { type Request, type Response, type NextFunction } from 'express';
import { PatientCreate, PatientUpdate, PatientSearchQuery, PatientId } from '@dms/types';
import { patientRepository, DuplicatePatientError } from '../repositories/patientRepository';
import { visitRepository } from '../repositories/visitRepository';
import type { ZodError } from 'zod';
import { sendZodValidationError } from '../lib/validation';
import { logAudit, logError } from '../lib/logger';
import { followupRepository } from '../repositories/followupRepository';
import { clinicDateISO } from '../lib/date';

const router = express.Router();

const handleValidationError = (req: Request, res: Response, issues: ZodError['issues']) => {
  return sendZodValidationError(req, res, issues);
};

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res, next).catch(next);

const todayIso = (): string => clinicDateISO();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = PatientCreate.safeParse(req.body);
    if (!parsed.success) {
      return handleValidationError(req, res, parsed.error.issues);
    }

    try {
      const patient = await patientRepository.create(parsed.data);

      if (req.auth) {
        logAudit({
          actorUserId: req.auth.userId,
          action: 'PATIENT_CREATE',
          entity: {
            type: 'PATIENT',
            id: patient.patientId,
          },
          meta: {
            name: patient.name,
            phone: patient.phone,
            sdId: patient.sdId,
          },
        });
      }

      return res.status(201).json(patient);
    } catch (err) {
      if (err instanceof DuplicatePatientError) {
        return res.status(409).json({
          error: err.code,
          message: err.message,
          traceId: req.requestId,
        });
      }
      throw err;
    }
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = PatientSearchQuery.safeParse(req.query);
    if (!parsed.success) {
      return handleValidationError(req, res, parsed.error.issues);
    }

    const { query, limit } = parsed.data;

    const params: { query?: string; limit: number } = { limit };

    if (query !== undefined) {
      params.query = query;
    }

    const patients = await patientRepository.search(params);

    return res.status(200).json({
      items: patients,
      nextCursor: null,
    });
  }),
);

router.get(
  '/:patientId/summary',
  asyncHandler(async (req, res) => {
    const parsedId = PatientId.safeParse(req.params.patientId);
    if (!parsedId.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid patient id',
        traceId: req.requestId,
      });
    }

    const patient = await patientRepository.getById(parsedId.data);
    if (!patient) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Patient not found',
        traceId: req.requestId,
      });
    }

    const visits = await visitRepository.listByPatientId(parsedId.data);

    const doneVisitCount = visits.filter((v) => v.status === 'DONE').length;

    const lastVisitDate =
      visits.length === 0
        ? null
        : (visits
            .map((v) => v.visitDate)
            .sort()
            .slice(-1)[0] ?? null);

    const today = todayIso();
    let nextFollowUpDate: string | null = null;

    for (const v of visits) {
      try {
        const followups = await followupRepository.listByVisitId(v.visitId);
        for (const fu of followups ?? []) {
          if (fu.status !== 'ACTIVE') continue;
          const d = String(fu.followUpDate);
          if (d < today) continue;
          if (!nextFollowUpDate || d < nextFollowUpDate) nextFollowUpDate = d;
        }
      } catch (err) {
        logError('patient_summary_followups_failed', {
          patientId: parsedId.data,
          visitId: v.visitId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return res.status(200).json({
      doneVisitCount,
      lastVisitDate,
      nextFollowUpDate,
    });
  }),
);

router.get(
  '/:patientId',
  asyncHandler(async (req, res) => {
    const parsedId = PatientId.safeParse(req.params.patientId);
    if (!parsedId.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid patient id',
        traceId: req.requestId,
      });
    }

    const patient = await patientRepository.getById(parsedId.data);
    if (!patient) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Patient not found',
        traceId: req.requestId,
      });
    }

    return res.status(200).json(patient);
  }),
);

router.patch(
  '/:patientId',
  asyncHandler(async (req, res) => {
    const parsedId = PatientId.safeParse(req.params.patientId);
    if (!parsedId.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid patient id',
        traceId: req.requestId,
      });
    }

    const parsedBody = PatientUpdate.safeParse(req.body);
    if (!parsedBody.success) {
      return handleValidationError(req, res, parsedBody.error.issues);
    }

    try {
      const updated = await patientRepository.update(parsedId.data, parsedBody.data);
      if (!updated) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Patient not found',
          traceId: req.requestId,
        });
      }

      if (req.auth) {
        logAudit({
          actorUserId: req.auth.userId,
          action: 'PATIENT_UPDATE',
          entity: {
            type: 'PATIENT',
            id: parsedId.data,
          },
          meta: {
            name: updated.name,
            phone: updated.phone,
          },
        });
      }

      return res.status(200).json(updated);
    } catch (err) {
      if (err instanceof DuplicatePatientError) {
        return res.status(409).json({
          error: err.code,
          message: err.message,
          traceId: req.requestId,
        });
      }
      throw err;
    }
  }),
);

router.delete(
  '/:patientId',
  asyncHandler(async (req, res) => {
    const parsedId = PatientId.safeParse(req.params.patientId);
    if (!parsedId.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid patient id',
        traceId: req.requestId,
      });
    }

    const deleted = await patientRepository.softDelete(parsedId.data);
    if (!deleted) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Patient not found',
        traceId: req.requestId,
      });
    }

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'PATIENT_SOFT_DELETE',
        entity: {
          type: 'PATIENT',
          id: parsedId.data,
        },
        meta: {},
      });
    }

    return res.status(204).send();
  }),
);

router.post(
  '/:patientId/restore',
  asyncHandler(async (req, res) => {
    const parsedId = PatientId.safeParse(req.params.patientId);
    if (!parsedId.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid patient id',
        traceId: req.requestId,
      });
    }

    const restored = await patientRepository.restore(parsedId.data);
    if (!restored) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Patient not found',
        traceId: req.requestId,
      });
    }

    if (req.auth) {
      logAudit({
        actorUserId: req.auth.userId,
        action: 'PATIENT_RESTORE',
        entity: {
          type: 'PATIENT',
          id: parsedId.data,
        },
        meta: {},
      });
    }

    return res.status(200).json(restored);
  }),
);

router.get(
  '/:patientId/visits',
  asyncHandler(async (req, res) => {
    const parsedId = PatientId.safeParse(req.params.patientId);
    if (!parsedId.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid patient id',
        traceId: req.requestId,
      });
    }

    const patient = await patientRepository.getById(parsedId.data);
    if (!patient) {
      return res.status(404).json({
        error: 'PATIENT_NOT_FOUND',
        message: 'Patient not found or has been deleted',
        traceId: req.requestId,
      });
    }

    const visits = await visitRepository.listByPatientId(parsedId.data);
    return res.status(200).json({ items: visits });
  }),
);

export default router;
