import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';

export const validate =
  <T>(schema: ZodType<T>) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return next(parsed.error);
    }

    req.body = parsed.data as T;
    return next();
  };
