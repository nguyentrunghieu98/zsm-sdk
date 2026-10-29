"use strict";
/** Error types raised by the SDK. Messages never include credentials or tokens. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidCredentialsError = exports.SessionRequiredError = exports.ApiError = exports.HttpError = exports.AuthenticationError = exports.ZsmError = void 0;
class ZsmError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = new.target.name;
    }
}
exports.ZsmError = ZsmError;
/** The workspace rejected the credentials or the session expired. */
class AuthenticationError extends ZsmError {
    status;
    code;
    constructor(message = 'Authentication failed.', options) {
        super(message, options);
        this.status = options?.status;
        this.code = options?.code;
    }
}
exports.AuthenticationError = AuthenticationError;
/** The workspace answered with a non-2xx status. */
class HttpError extends ZsmError {
    status;
    /** Truncated, sanitized response body for diagnostics. */
    body;
    constructor(status, body, context = 'Workspace request') {
        super(`${context} failed with HTTP ${status}.`);
        this.status = status;
        this.body = body;
    }
}
exports.HttpError = HttpError;
/** The workspace answered with an error envelope (HTTP 200 or otherwise). */
class ApiError extends ZsmError {
    code;
    status;
    constructor(message, options) {
        super(message);
        this.code = options?.code;
        this.status = options?.status;
    }
}
exports.ApiError = ApiError;
/** The call needs a session but none is available. */
class SessionRequiredError extends ZsmError {
    constructor(message = 'No session available. Call login() first.') {
        super(message);
    }
}
exports.SessionRequiredError = SessionRequiredError;
/** The login form answered with an error redirect (wrong username/password). */
class InvalidCredentialsError extends AuthenticationError {
    constructor(message = 'The workspace rejected the username/password.') {
        super(message);
    }
}
exports.InvalidCredentialsError = InvalidCredentialsError;
