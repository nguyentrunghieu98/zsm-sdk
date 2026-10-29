import {
  ApiError,
  AuthenticationError,
  InvalidCredentialsError,
  SessionRequiredError,
  ZsmError,
} from './errors.js';
import { Transport, assertOk, type TransportResponse } from './http.js';
import { parseJwtExpiry } from './cookies.js';
import {
  asBoolean,
  asId,
  asNumber,
  asRecord,
  asString,
  parseJsonValue,
  parsePermissions,
  toInternationalPhone,
} from './utils.js';
import type {
  Account,
  ClientOptions,
  ContactProfile,
  Credentials,
  FriendRequestResult,
  FriendRequestStatus,
  FriendRequestStatusResult,
  SendMessageInput,
  SendMessageResult,
  Session,
  SessionUser,
} from './types.js';

const LOGIN_PATH = '/login';
const VERIFY_PATH = '/api/auth/verify';
const ACCOUNTS_PATH = '/api/account/getAll';
const SEARCH_PHONE_PATH = '/api/search/searchByPhoneAndAccount';
const FRIEND_STATUS_PATH = '/api/conversation/friendRequestStatus';
const ADD_FRIEND_PATH = '/api/contact/addFriend';
const SEND_MESSAGE_PATH = '/api/message/sms';

/** Re-verify the session this long before the access token expires. */
const VERIFY_MARGIN_MS = 30 * 60 * 1000;

export class ZsmClient {
  readonly #transport: Transport;
  readonly #baseUrl: string;
  readonly #loginTarget: string;
  #session: Session | null = null;

  constructor(options: ClientOptions) {
    if (!options.baseUrl) throw new ZsmError('`baseUrl` is required.');
    if (!options.loginUrl) throw new ZsmError('`loginUrl` is required.');
    const injectedFetch = options.fetch ?? globalThis.fetch;
    if (typeof injectedFetch !== 'function') {
      throw new ZsmError('No fetch implementation available. Pass `fetch` in ClientOptions.');
    }
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    if (!options.loginTarget) throw new ZsmError('`loginTarget` is required.');
    this.#loginTarget = options.loginTarget;
    this.#transport = new Transport({
      baseUrl: this.#baseUrl,
      loginUrl: options.loginUrl,
      timeoutMs: options.timeoutMs ?? 20_000,
      fetch: injectedFetch,
      userAgent: options.userAgent,
    });
  }

  get session(): Session | null {
    return this.#session;
  }

  /** Reuse a previously persisted session (for example from a credential store). */
  useSession(session: Session): void {
    if (!session.accessToken) throw new ZsmError('Session must contain an accessToken.');
    this.#session = { ...session };
  }

  /** Drop the in-memory session and cookies. */
  logout(): void {
    this.#session = null;
    this.#transport.cookies.clear();
  }

  /**
   * Log in with the username/password form and establish a workspace session.
   *
   * The form posts to the provider login host. The resulting session cookie is
   * then exchanged for an access token by the workspace verify endpoint.
   */
  async login(credentials: Credentials): Promise<Session> {
    if (!credentials?.username || !credentials?.password) {
      throw new ZsmError('Both username and password are required.');
    }

    this.#session = null;
    const loginUrl = `${this.#transport.loginUrl}${LOGIN_PATH}?target=${encodeURIComponent(this.#loginTarget)}`;
    const page = await this.#transport.request(loginUrl, { method: 'GET' });
    if (page.status < 200 || page.status >= 400) {
      throw new AuthenticationError(`Login page is unavailable (HTTP ${page.status}).`, { status: page.status });
    }

    const posted = await this.#transport.request(page.url, {
      method: 'POST',
      form: {
        username: credentials.username,
        password: credentials.password,
        targetUrl: this.#baseUrl,
      },
    });

    if (wasRejected(posted)) {
      throw new InvalidCredentialsError();
    }
    if (posted.status >= 400 && !this.#transport.cookies.size) {
      throw new AuthenticationError(`Login request failed (HTTP ${posted.status}).`, { status: posted.status });
    }

    try {
      return await this.verify();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw new InvalidCredentialsError(
          'Login did not produce an authenticated workspace session. The account may need MFA/CAPTCHA, or the login flow changed.',
        );
      }
      throw error;
    }
  }

  /** Adopt an access token obtained elsewhere (browser session, credential store). */
  async loginWithToken(accessToken: string): Promise<Session> {
    if (!accessToken) throw new ZsmError('An access token is required.');
    this.#session = { accessToken };
    return this.verify();
  }

  /** Call the verify endpoint and refresh the in-memory session. */
  async verify(): Promise<Session> {
    const token = this.#session?.accessToken;
    const first = await this.#transport.request(VERIFY_PATH, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      // The web client literally sends `Bearer null` before a token exists.
      // Mirror it first, then retry cookie-only for robustness.
      firstHopHeaders: token ? undefined : { authorization: 'Bearer null' },
    });
    const firstUsable = isUsableSessionResponse(first);
    const response = firstUsable || token ? first : await this.#transport.request(VERIFY_PATH, {});
    if (!isUsableSessionResponse(response)) {
      const error = envelopeError(response);
      throw new AuthenticationError(error?.message ?? `Session verification failed (HTTP ${response.status}).`, {
        status: response.status,
        code: error?.code,
      });
    }

    const body = asRecord(response.json);
    const payload = asRecord(body?.data) ?? body;
    if (!payload) throw new AuthenticationError('Verify response is not a JSON object.');
    const accessToken = asString(payload.accessToken) ?? asString(body?.accessToken);
    if (!accessToken) throw new AuthenticationError('Verify response did not contain an access token.');

    const session: Session = {
      accessToken,
      loginV2Token: asString(payload.loginV2Token),
      ctoken: asString(payload.ctoken),
      sessionId: asString(payload.sessionId),
      user: asRecord(payload.user) as SessionUser | undefined,
      permissions: parsePermissions(payload.permissions),
      expiresAt: parseJwtExpiry(accessToken) ?? asNumber(payload.expiresAt),
      raw: payload,
    };
    this.#session = session;
    return session;
  }

  /** List the chat accounts the signed-in workspace user can operate. */
  async listAccounts(): Promise<Account[]> {
    await this.#ensureSession();
    const response = await this.#transport.request(ACCOUNTS_PATH, { headers: this.#authHeaders() });
    const body = this.#unwrap(response, 'List accounts');
    const data = parseJsonValue(body.data);
    const items = extractList(data) ?? extractList(body.accounts) ?? [];
    return items
      .map((item) => normalizeAccount(item))
      .filter((account): account is Account => account !== undefined);
  }

  /** Find a contact by phone number, using one sale account to search. */
  async findUserByPhone(accountId: string, phone: string): Promise<ContactProfile | null> {
    requireId(accountId, 'accountId');
    if (!phone?.trim()) throw new ZsmError('A phone number is required.');
    await this.#ensureSession();
    const response = await this.#transport.request(SEARCH_PHONE_PATH, {
      query: { searchKey: toInternationalPhone(phone), accountId },
      headers: this.#authHeaders(),
    });
    const body = this.#unwrap(response, 'Find user by phone');
    const data = asRecord(parseJsonValue(body.data)) ?? asRecord(body);
    if (!data) return null;

    const profile = asRecord(parseJsonValue(data.profile)) ?? asRecord(parseJsonValue(data.user)) ?? data;
    const conversation = asRecord(parseJsonValue(data.conversation));
    const userId =
      asId(profile.userId) ??
      asId(profile.uid) ??
      asId(data.userId) ??
      asId(data.uid) ??
      asId(conversation?.userId);
    if (!userId) return null;

    return {
      userId,
      name: asString(profile.name) ?? asString(profile.displayName),
      avatar: asString(profile.avatar) ?? asString(profile.avatarUrl),
      conversationId: asId(data.conversationId) ?? asId(conversation?.id),
      raw: profile,
    };
  }

  /** Read the current friendship / pending-request state for a contact. */
  async getFriendRequestStatus(accountId: string, userId: string): Promise<FriendRequestStatusResult> {
    requireId(accountId, 'accountId');
    requireId(userId, 'userId');
    await this.#ensureSession();
    const response = await this.#transport.request(FRIEND_STATUS_PATH, {
      method: 'POST',
      json: { accountId, friendId: userId },
      headers: this.#authHeaders(),
    });
    const body = this.#unwrap(response, 'Friend request status');
    const data = asRecord(parseJsonValue(body.data)) ?? body;
    return { status: normalizeFriendStatus(data), raw: data };
  }

  /**
   * Send a friend request from one sale account.
   *
   * The endpoint mutates state despite using GET, so the SDK never retries it.
   * Business-level codes are returned to the caller instead of being thrown.
   */
  async sendFriendRequest(accountId: string, userId: string, message?: string): Promise<FriendRequestResult> {
    requireId(accountId, 'accountId');
    requireId(userId, 'userId');
    await this.#ensureSession();
    const response = await this.#transport.request(ADD_FRIEND_PATH, {
      query: {
        accountId,
        userId,
        ...(message ? { msg: message } : {}),
      },
      headers: this.#authHeaders(),
    });
    assertOk(response, 'Send friend request');

    const body = asRecord(response.json) ?? {};
    const payload = asRecord(parseJsonValue(body.data)) ?? body;
    const code = asNumber(payload.error_code) ?? asNumber(body.error_code);
    const messageText = asString(payload.error_message) ?? asString(body.error_message);
    const isRequested = asBoolean(payload.is_requested) ?? asBoolean(payload.isRequested) ?? asBoolean(body.is_requested);
    const isFriend =
      asBoolean(payload.is_friend) ?? asBoolean(payload.isFriend) ?? asBoolean(body.is_friend) ?? asBoolean(body.isFriend);

    let status: FriendRequestStatus;
    if (code === 222) {
      status = 'ALREADY_FRIENDS';
    } else if (code !== undefined && code !== 0) {
      status = 'UNKNOWN';
    } else if (isFriend) {
      status = 'ALREADY_FRIENDS';
    } else if (isRequested === false) {
      status = 'ALREADY_INVITED';
    } else {
      status = 'INVITED';
    }

    return { status, code, message: messageText, raw: payload };
  }

  /** Send a text message from one sale account to a contact. */
  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    requireId(input.accountId, 'accountId');
    requireId(input.toId, 'toId');
    if (!input.message?.trim()) throw new ZsmError('A message is required.');
    await this.#ensureSession();
    const response = await this.#transport.request(SEND_MESSAGE_PATH, {
      method: 'POST',
      json: { accountId: input.accountId, toId: input.toId, message: input.message },
      headers: this.#authHeaders(),
    });
    const body = this.#unwrap(response, 'Send message');
    const data = asRecord(parseJsonValue(body.data)) ?? body;
    const messageId =
      asId(data.cliMsgId) ?? asId(data.msgId) ?? asId(data.messageId) ?? asId(data.id) ?? asId(body.cliMsgId);
    return { messageId, raw: data };
  }

  async #ensureSession(): Promise<void> {
    if (!this.#session?.accessToken) throw new SessionRequiredError();
    const expiresAt = this.#session.expiresAt;
    if (expiresAt !== undefined && Date.now() >= expiresAt - VERIFY_MARGIN_MS) {
      await this.verify();
    }
  }

  #authHeaders(): Record<string, string> {
    const token = this.#session?.accessToken;
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  #unwrap(response: TransportResponse, context: string): Record<string, unknown> {
    assertOk(response, context);
    const body = asRecord(response.json);
    if (!body) {
      if (!response.text.trim()) return {};
      throw new ApiError(`${context}: workspace returned a non-JSON response.`, { status: response.status });
    }
    const error = envelopeError(response);
    if (error) throw new ApiError(`${context}: ${error.message}`, { code: error.code, status: response.status });
    return body;
  }
}

function isSuccessful(response: TransportResponse): boolean {
  return response.status >= 200 && response.status < 300;
}

function isUsableSessionResponse(response: TransportResponse): boolean {
  if (!isSuccessful(response) || envelopeError(response)) return false;
  const body = asRecord(response.json);
  const payload = asRecord(body?.data) ?? body;
  return Boolean(asString(payload?.accessToken) ?? asString(body?.accessToken));
}

function wasRejected(response: TransportResponse): boolean {
  const urls = [...response.visited, response.url];
  return urls.some((url) => {
    try {
      return new URL(url).searchParams.get('error') === 'true';
    } catch {
      return false;
    }
  });
}

function envelopeError(response: TransportResponse): { message: string; code?: string | number } | undefined {
  const body = asRecord(response.json);
  if (!body) {
    if (response.status >= 400) {
      return { message: `Workspace returned HTTP ${response.status}.`, code: response.status };
    }
    return undefined;
  }

  if (body.status === 'error' || body.success === false) {
    const error = asRecord(body.error);
    return {
      message: asString(error?.message) ?? asString(body.error_message) ?? asString(body.message) ?? 'Workspace returned an error.',
      code: asId(error?.code) ?? asId(body.code) ?? asId(body.error_code),
    };
  }

  const rootCode = asNumber(body.error_code);
  if (rootCode !== undefined && rootCode !== 0) {
    return {
      message: asString(body.error_message) ?? asString(body.message) ?? `Workspace error ${rootCode}.`,
      code: rootCode,
    };
  }

  const data = asRecord(body.data);
  const dataCode = asNumber(data?.error_code);
  if (dataCode !== undefined && dataCode !== 0) {
    return {
      message: asString(data?.error_message) ?? asString(body.error_message) ?? `Workspace error ${dataCode}.`,
      code: dataCode,
    };
  }

  return undefined;
}

function extractList(value: unknown): unknown[] | undefined {
  const parsed = parseJsonValue(value);
  if (Array.isArray(parsed)) return parsed;
  const record = asRecord(parsed);
  if (!record) return undefined;
  for (const key of ['content', 'items', 'rows', 'accounts']) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return undefined;
}

function normalizeAccount(item: unknown): Account | undefined {
  const raw = asRecord(item);
  if (!raw) return undefined;
  const accountId = asId(raw.accountId) ?? asId(raw.account_id) ?? asId(raw.id) ?? asId(raw.uuid);
  if (!accountId) return undefined;
  return {
    accountId,
    name:
      asString(raw.name) ??
      asString(raw.fullName) ??
      asString(raw.displayName) ??
      asString(raw.accountName) ??
      asString(raw.alias),
    avatar: asString(raw.avatar) ?? asString(raw.avatarUrl) ?? asString(raw.image) ?? asString(raw.profilePicture),
    status: (asString(raw.status) ?? asNumber(raw.status) ?? asString(raw.sessionStatus) ?? asNumber(raw.active)) as
      | string
      | number
      | undefined,
    raw,
  };
}

function normalizeFriendStatus(data: Record<string, unknown>): FriendRequestStatus {
  const explicit =
    asString(data.status) ??
    asString(data.friendStatus) ??
    asString(data.friend_status) ??
    asString(data.state);
  if (explicit) {
    const normalized = explicit.toUpperCase();
    if (normalized.includes('INVITE') || normalized.includes('REQUEST') || normalized.includes('PENDING')) {
      return normalized.includes('ALREADY') ? 'ALREADY_INVITED' : 'INVITED';
    }
    if (normalized.includes('FRIEND') || normalized.includes('ACCEPT')) return 'ALREADY_FRIENDS';
    if (normalized.includes('NONE')) return 'NONE';
  }

  const isFriend =
    asBoolean(data.isFriend) ?? asBoolean(data.is_friend) ?? asBoolean(data.friend);
  if (isFriend) return 'ALREADY_FRIENDS';
  const isRequested = asBoolean(data.isRequested) ?? asBoolean(data.is_requested) ?? asBoolean(data.requested);
  if (isRequested) return 'INVITED';
  if (isFriend === false) return 'NONE';
  return 'UNKNOWN';
}

function requireId(value: string | undefined, field: string): void {
  if (!value || !value.trim()) throw new ZsmError(`\`${field}\` is required.`);
}
