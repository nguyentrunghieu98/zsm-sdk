/** Public types for the zsm-sdk client. */

export interface ClientOptions {
  /** Workspace host, e.g. `https://workspace.example`. Required. */
  baseUrl: string;
  /** Login host that serves the username/password form. Required. */
  loginUrl: string;
  /** Required `target` value of the login form, as configured by the workspace. */
  loginTarget: string;
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
  /** Per-account id of this person inside one sale account. */
  userId: string;
  name?: string;
  avatar?: string;
  /** Conversation id returned by the search call, when present. */
  conversationId?: string;
  /**
   * Account-independent id of the person (`profile.globalId`).
   *
   * The same human always gets the same `globalId` on every sale account,
   * while `userId` differs per account. Use `globalId` to join one customer
   * across accounts and `userId` for every operation that takes an account.
   */
  globalId?: string;
  /** `true` when the sale account that ran the search is already friends with the person. */
  isFriend?: boolean;
  /** Raw profile object as returned by the workspace. */
  raw: Record<string, unknown>;
}

/** One row of a sale account's friend list. */
export interface FriendContact {
  /** Per-account id, valid only for the account the list was read from. */
  uid: string;
  /** Account-independent id of the person. */
  globalId: string;
  displayName?: string;
  zaloName?: string;
  /** Raw row as returned by the workspace. */
  raw: Record<string, unknown>;
}

export interface FriendListResult {
  accountId: string;
  friends: FriendContact[];
  /** `false` when the endpoint capped the page and more friends remain. */
  complete: boolean;
  totalElements?: number;
  raw: unknown;
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

export interface GroupMember {
  id: string;
  name?: string;
  raw: Record<string, unknown>;
}

export interface GroupInfo {
  groupId: string;
  name?: string;
  creatorId?: string;
  memberCount?: number;
  members?: GroupMember[];
  raw: Record<string, unknown>;
}

export interface InviteMembersInput {
  accountId: string;
  groupId: string;
  memberIds: string[];
}

export interface InviteMembersResult {
  /** `INVITED` when the workspace accepted the request, `ALREADY_IN_GROUP`, `FAILED` or `UNKNOWN`. */
  status: 'INVITED' | 'ALREADY_IN_GROUP' | 'FAILED' | 'UNKNOWN';
  code?: number;
  message?: string;
  raw: unknown;
}

export interface GroupMembersResult {
  /** Subset of the requested ids that are currently in the group. */
  memberIds: string[];
  /** Profiles of the members that matched. */
  members: GroupMember[];
  /** `false` when the group list is paginated and more members remain. */
  complete: boolean;
  raw: unknown;
}
