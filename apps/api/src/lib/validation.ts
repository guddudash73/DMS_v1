import type { Request, Response } from 'express';
import type { ZodIssue } from 'zod';

const buildFieldErrorsFromZodIssues = (issues: readonly ZodIssue[]): Record<string, string[]> => {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const path = issue.path.join('.') || '_root';
    if (!fieldErrors[path]) fieldErrors[path] = [];
    fieldErrors[path]!.push(issue.message);
  }
  return fieldErrors;
};

export const sendZodValidationError = (
  req: Request,
  res: Response,
  issues: readonly ZodIssue[],
) => {
  const fieldErrors = buildFieldErrorsFromZodIssues(issues);

  return res.status(400).json({
    error: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    fieldErrors,
    traceId: req.requestId,
  });
};
