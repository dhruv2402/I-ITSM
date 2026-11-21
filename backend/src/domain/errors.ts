/**
 * Custom exception hierarchy. Every business error extends AppError and carries
 * its own HTTP status and machine-readable code, so the API error handler can
 * translate any of them polymorphically without a big if/else chain.
 */
export abstract class AppError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly code: string;

  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  readonly httpStatus = 400;
  readonly code = 'INVALID_INPUT';
}

export class InvalidCredentialsError extends AppError {
  readonly httpStatus = 401;
  readonly code = 'INVALID_LOGIN';
  constructor() {
    super('Invalid e-mail or password');
  }
}

export class AuthenticationError extends AppError {
  readonly httpStatus = 401;
  readonly code = 'UNAUTHENTICATED';
}

export class AuthorizationError extends AppError {
  readonly httpStatus = 403;
  readonly code = 'UNAUTHORIZED_OPERATION';
}

export class NotFoundError extends AppError {
  readonly httpStatus = 404;
  readonly code: string = 'NOT_FOUND';
}

export class IncidentNotFoundError extends NotFoundError {
  readonly code = 'INVALID_INCIDENT';
  constructor(id: string) {
    super(`Incident ${id} does not exist`);
  }
}

export class ServiceNotFoundError extends NotFoundError {
  readonly code = 'SERVICE_NOT_FOUND';
  constructor(id: string) {
    super(`IT service ${id} does not exist`);
  }
}

export class UserNotFoundError extends NotFoundError {
  readonly code = 'USER_NOT_FOUND';
  constructor(id: string) {
    super(`User ${id} does not exist`);
  }
}

export class ConflictError extends AppError {
  readonly httpStatus = 409;
  readonly code: string = 'CONFLICT';
}

export class InvalidStateTransitionError extends ConflictError {
  readonly code = 'INVALID_STATE_TRANSITION';
  constructor(from: string, action: string) {
    super(`Action '${action}' is not allowed while the incident is ${from}`, { from, action });
  }
}

export class TechnicianUnavailableError extends ConflictError {
  readonly code = 'TECHNICIAN_UNAVAILABLE';
}

export class WorkloadExceededError extends ConflictError {
  readonly code = 'TECHNICIAN_WORKLOAD_EXCEEDED';
  constructor(technicianName: string, current: number, max: number) {
    super(`${technicianName} already has ${current} active incidents (limit ${max})`, { current, max });
  }
}

export class DuplicateIncidentError extends ConflictError {
  readonly code = 'DUPLICATE_INCIDENT';
  constructor(existingId: string) {
    super(`You already reported this problem as ${existingId}`, { existingId });
  }
}

export class SlaConfigurationError extends AppError {
  readonly httpStatus = 422;
  readonly code = 'SLA_NOT_CONFIGURED';
}

export class DatabaseError extends AppError {
  readonly httpStatus = 503;
  readonly code = 'DATABASE_FAILURE';
}

export class ExternalServiceError extends AppError {
  readonly httpStatus = 502;
  readonly code = 'NETWORK_FAILURE';
}
