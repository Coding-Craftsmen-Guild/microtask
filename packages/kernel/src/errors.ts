/** An error carrying the HTTP status and stable code the API should report. */
export abstract class AppError extends Error {
  /** The HTTP status this error maps to. */
  abstract readonly status: number

  /** A stable machine-readable code for this error kind. */
  abstract readonly code: string

  /** Creates the error, naming it after the concrete subclass. */
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/** The requested thing does not exist, or the caller may not know that it does. */
export class NotFound extends AppError {
  readonly status = 404
  readonly code = 'not_found'
}

/** The caller is known but not permitted to perform this action. */
export class Forbidden extends AppError {
  readonly status = 403
  readonly code = 'forbidden'
}

/** The request was understood but its content is unacceptable. */
export class Invalid extends AppError {
  readonly status = 422
  readonly code = 'invalid'
}

/** The request conflicts with the current state, such as a stale write. */
export class Conflict extends AppError {
  readonly status = 409
  readonly code = 'conflict'
}
