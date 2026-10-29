/** Public types for the zsm-sdk client. */

export interface ClientOptions {
  /** Workspace host, e.g. `https://workspace.example`. Required. */
  baseUrl: string;
  /** Login host that serves the username/password form. Required. */
  loginUrl: string;
  /** Value of the `target` query used by the login form. Defaults to `zalo`. */
  loginTarget?: string;
  /** Per-request timeout in milliseconds. Defaults to 20000. */
  timeoutMs?: number;
  /** Injectable fetch implementation, mainly for tests. */
  fetch?: typeof fetch;
  /** Optional User-Agent override. */
  userAgent?: string;
}

export interface Credentials {
  username: string;
  password: string;
}

export interface SessionUser {
  [key: string]: unknown;
}

export interface Session {
  accessToken: string;
  /** Short-lived token used by the interactive login-v2 flow, when present. */
  loginV2Token?: string;
  /** Client token exposed by the verify response, when present. */
  ctoken?: string;
  sessionId?: string;
  user?: SessionUser;
  permissions?: string[];
  /** Epoch milliseconds derived from the access token `exp` claim when possible. */
  expiresAt?: number;
  /** Raw payload returned by the verify call, with tokens left in place. */
  raw?: Record<string, unknown>;
}

export interface Account {
  accountId: string;
  name?: string;
  avatar?: string;
  status?: string | number;
  /** Raw account object as returned by the workspace. */
  raw: Record<string, unknown>;
}

export interface ContactProfile {
  userId: string;
  name?: string;
  avatar?: string;
  /** Conversation id returned by the search call, when present. */
  conversationId?: string;
  /** Raw profile object as returned by the workspace. */
  raw: Record<string, unknown>;
}

export type FriendRequestStatus =
  | 'INVITED'
  | 'ALREADY_FRIENDS'
  | 'ALREADY_INVITED'
  | 'PENDING'
  | 'NONE'
  | 'UNKNOWN';

export interface FriendRequestStatusResult {
  status: FriendRequestStatus;
  /** Raw payload returned by the workspace. */
  raw: unknown;
}

export interface FriendRequestResult {
  status: FriendRequestStatus;
  /** Workspace error code, 0 when the call succeeded. */
  code?: number;
  message?: string;
  raw: unknown;
}

export interface SendMessageInput {
  accountId: string;
  toId: string;
  message: string;
}

export interface SendMessageResult {
  messageId?: string;
  raw: unknown;
}

export interface ApiEnvelope<T = unknown> {
  apiVersion?: string;
  status?: string;
  data?: T;
  error?: {
    message?: string;
    code?: string | number | null;
    prms?: unknown;
  };
  error_code?: number;
  error_message?: string;
  [key: string]: unknown;
}
