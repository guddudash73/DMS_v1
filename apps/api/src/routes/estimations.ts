import express from 'express';
import { EstimationCreateRequest, PatientId, EstimationId } from '@dcm/types';
import { requireRole } from '../middlewares/auth';
import {
  estimationRepository,
  EstimationRuleViolationError,
} from '../repositories/estimationRepository';

export default express
  .Router()
  .use(requireRole('DOCTOR', 'ADMIN'))

  // CREATE
  .post('/:patientId/estimations', async (req, res, next) => {
    try {
      const patientId = PatientId.parse(req.params.patientId);
      const input = EstimationCreateRequest.parse(req.body);

      const createdByUserId = req.auth!.userId;

      const estimation = await estimationRepository.create({
        patientId,
        createdByUserId,
        input,
      });

      return res.status(201).json(estimation);
    } catch (err) {
      if (err instanceof EstimationRuleViolationError) {
        return res.status(err.statusCode).json({ error: err.code, message: err.message });
      }
      return next(err);
    }
  })

  // LIST
  .get('/:patientId/estimations', async (req, res, next) => {
    try {
      const patientId = PatientId.parse(req.params.patientId);

      const out = await estimationRepository.listByPatient({ patientId });
      return res.status(200).json(out);
    } catch (err) {
      return next(err);
    }
  })

  // GET BY ID (scoped to patient)
  .get('/:patientId/estimations/:estimationId', async (req, res, next) => {
    try {
      const patientId = PatientId.parse(req.params.patientId);
      const estimationId = EstimationId.parse(req.params.estimationId);

      const estimation = await estimationRepository.getByPatient({
        patientId,
        estimationId,
      });

      if (!estimation) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Estimation not found' });
      }

      return res.status(200).json(estimation);
    } catch (err) {
      return next(err);
    }
  })

  // UPDATE (full replace)
  .patch('/:patientId/estimations/:estimationId', async (req, res, next) => {
    try {
      const patientId = PatientId.parse(req.params.patientId);
      const estimationId = EstimationId.parse(req.params.estimationId);
      const input = EstimationCreateRequest.parse(req.body);

      const updated = await estimationRepository.updateByPatient({
        patientId,
        estimationId,
        input,
      });

      if (!updated) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Estimation not found' });
      }

      return res.status(200).json(updated);
    } catch (err) {
      if (err instanceof EstimationRuleViolationError) {
        return res.status(err.statusCode).json({ error: err.code, message: err.message });
      }
      return next(err);
    }
  })

  // DELETE
  .delete('/:patientId/estimations/:estimationId', async (req, res, next) => {
    try {
      const patientId = PatientId.parse(req.params.patientId);
      const estimationId = EstimationId.parse(req.params.estimationId);

      const ok = await estimationRepository.deleteByPatient({ patientId, estimationId });

      if (!ok) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Estimation not found' });
      }

      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  });
