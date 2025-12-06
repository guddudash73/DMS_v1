import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logInfo, logError } from '../lib/logger';
import { AuthError } from './auth';
import { errorResponseSchema, type ErrorResponse } from '@dms/types';

type DomainError = Error & {
  code?: string;
  statusCode?: number;
  fieldErrors?: Record<string, string[]>;
};

const buildFieldErrorsFromZod = (zodError: ZodError): Record<string, string[]> => {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of zodError.issues) {
    const path = issue.path.join('.') || '_root';
    if (!fieldErrors[path]) fieldErrors[path] = [];
    fieldErrors[path]!.push(issue.message);
  }
  return fieldErrors;
};

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const traceId = req.requestId;

  if (err instanceof AuthError) {
    const code = err.code ?? 'UNAUTHORIZED';
    const payload: ErrorResponse = {
      error: code,
      message: err.message,
      traceId,
    };

    logInfo('auth_error', {
      reqId: traceId,
      userId: req.auth?.userId ?? undefined,
      code,
      path: req.path,
      method: req.method,
    });

    return res.status(err.statusCode).json(payload);
  }

  if (err instanceof ZodError) {
    const payload: ErrorResponse = {
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      fieldErrors: buildFieldErrorsFromZod(err),
      traceId,
    };

    logInfo('validation_error', {
      reqId: traceId,
      path: req.path,
      method: req.method,
      issueCount: err.issues.length,
    });

    return res.status(400).json(payload);
  }

  const maybeDomain = err as DomainError;
  if (maybeDomain && typeof maybeDomain.code === 'string') {
    const status =
      maybeDomain.statusCode && maybeDomain.statusCode >= 400 ? maybeDomain.statusCode : 400;

    const candidate: Partial<ErrorResponse> = {
      error: maybeDomain.code || 'INTERNAL_SERVER_ERROR',
      message: maybeDomain.message || 'Unexpected error',
      fieldErrors: maybeDomain.fieldErrors,
      traceId,
    };

    let payload: ErrorResponse;
    try {
      payload = errorResponseSchema.parse(candidate);
    } catch {
      payload = {
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected error',
        traceId,
      };
    }

    if (status >= 500) {
      logError('domain_error_5xx', {
        reqId: traceId,
        path: req.path,
        method: req.method,
        name: maybeDomain.name,
        code: maybeDomain.code,
      });
    } else {
      logInfo('domain_error_4xx', {
        reqId: traceId,
        path: req.path,
        method: req.method,
        name: maybeDomain.name,
        code: maybeDomain.code,
      });
    }

    return res.status(status).json(payload);
  }

  if (err instanceof Error) {
    const anyErr = err as Error & { code?: string };

    logError('unhandled_error', {
      reqId: traceId,
      userId: req.auth?.userId ?? undefined,
      name: err.name,
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      errorCode: anyErr.code ?? 'UNEXPECTED',
    });
  } else {
    logError('unhandled_error_non_error', {
      reqId: traceId,
      userId: req.auth?.userId ?? undefined,
      error: err,
      path: req.path,
      method: req.method,
      errorCode: 'UNEXPECTED',
    });
  }

  const payload: ErrorResponse = {
    error: 'INTERNAL_SERVER_ERROR',
    message: 'Unexpected error',
    traceId,
  };

  return res.status(500).json(payload);
};
