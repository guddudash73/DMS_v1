import express, { type Request, type Response, type NextFunction } from 'express';
import { PatientCreate, PatientUpdate, PatientSearchQuery, PatientId } from '@dms/types';
import { patientRepository, DuplicatePatientError } from '../repositories/patientRepository';
import { visitRepository } from '../repositories/visitRepository';

const router = express.Router();

const handleValidationError = (res: Response, issues: unknown) => {
  return res.status(400).json({
    error: 'VALIDATION_ERROR',
    issues,
  });
};

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res, next).catch(next);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = PatientCreate.safeParse(req.body);
    if (!parsed.success) {
      return handleValidationError(res, parsed.error.issues);
    }

    try {
      const patient = await patientRepository.create(parsed.data);
      return res.status(201).json(patient);
    } catch (err) {
      if (err instanceof DuplicatePatientError) {
        return res.status(409).json({
          error: err.code,
          message: err.message,
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
      return handleValidationError(res, parsed.error.issues);
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
  '/:patientId',
  asyncHandler(async (req, res) => {
    const parsedId = PatientId.safeParse(req.params.patientId);
    if (!parsedId.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid patient id',
      });
    }

    const patient = await patientRepository.getById(parsedId.data);
    if (!patient) {
      return res.status(404).json({ error: 'NOT_FOUND' });
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
      });
    }

    const parsedBody = PatientUpdate.safeParse(req.body);
    if (!parsedBody.success) {
      return handleValidationError(res, parsedBody.error.issues);
    }

    try {
      const updated = await patientRepository.update(parsedId.data, parsedBody.data);
      if (!updated) {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
      return res.status(200).json(updated);
    } catch (err) {
      if (err instanceof DuplicatePatientError) {
        return res.status(409).json({
          error: err.code,
          message: err.message,
        });
      }
      throw err;
    }
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
      });
    }

    const visits = await visitRepository.listByPatientId(parsedId.data);
    return res.status(200).json({ items: visits });
  }),
);

export default router;
