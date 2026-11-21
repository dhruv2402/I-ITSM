import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, ZodTypeAny, z } from 'zod';
import { Permission } from '../domain/enums';
import { AppError, AuthorizationError, ValidationError } from '../domain/errors';
import { User } from '../domain/user/User';
import { AuthService } from '../services/AuthService';

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

/** Wraps async route handlers so rejected promises reach the error handler. */
export const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

/** Removes undefined values so partial updates never overwrite fields with undefined. */
export function compact<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Validates and returns typed input; invalid input becomes a 400 with field details. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const details = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new ValidationError(`Invalid input: ${details.map((d) => `${d.field || 'body'} - ${d.message}`).join('; ')}`, details);
  }
  return r.data;
}

/** JWT authentication: Authorization: Bearer <token> (or ?token= for EventSource streams). */
export const authenticate =
  (auth: AuthService): RequestHandler =>
  (req, _res, next) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : typeof req.query.token === 'string' ? req.query.token : undefined;
    auth
      .authenticate(token)
      .then((u) => {
        req.user = u;
        next();
      })
      .catch(next);
  };

/** Role-based authorisation guard. */
export const requirePermission =
  (...perms: Permission[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new AuthorizationError('Not authenticated'));
    if (!perms.some((p) => req.user!.hasPermission(p))) return next(new AuthorizationError('You do not have permission for this operation'));
    next();
  };

export const currentUser = (req: Request): User => {
  if (!req.user) throw new AuthorizationError('Not authenticated');
  return req.user;
};

/** Central error translation: every AppError subclass maps itself to an HTTP status (polymorphism). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid input', details: err.issues } });
    return;
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    return;
  }
  console.error('[api] unexpected error:', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side' } });
}
