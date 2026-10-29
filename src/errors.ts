/** Error types raised by the SDK. Messages never include credentials or tokens. */

export class ZsmError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The workspace rejected the credentials or the session expired. */
export class AuthenticationError extends ZsmError {
  readonly status?: number;
  readonly code?: string | number;

  constructor(message = 'Authentication failed.', options?: { status?: number; code?: string | number; cause?: unknown }) {
    super(message, options);
    this.status = options?.status;
    this.code = options?.code;
  }
}

/** The workspace answered with a non-2xx status. */
export class HttpError extends ZsmError {
  readonly status: number;
  /** Truncated, sanitized response body for diagnostics. */
  readonly body: string;

  constructor(status: number, body: string, context = 'Workspace request') {
    super(`${context} failed with HTTP ${status}.`);
    this.status = status;
    this.body = body;
  }
}

/** The workspace answered with an error envelope (HTTP 200 or otherwise). */
export class ApiError extends ZsmError {
  readonly code?: string | number;
  readonly status?: number;

  constructor(message: string, options?: { code?: string | number; status?: number }) {
    super(message);
    this.code = options?.code;
    this.status = options?.status;
  }
}

/** The call needs a session but none is available. */
export class SessionRequiredError extends ZsmError {
  constructor(message = 'No session available. Call login() first.') {
    super(message);
  }
}

/** The login form answered with an error redirect (wrong username/password). */
export class InvalidCredentialsError extends AuthenticationError {
  constructor(message = 'The workspace rejected the username/password.') {
    super(message);
  }
}
