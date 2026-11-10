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
  FriendContact,
  FriendListResult,
  FriendRequestResult,
  FriendRequestStatus,
  FriendRequestStatusResult,
  GroupInfo,
  GroupMember,
  GroupMembersResult,
  InviteMembersInput,
  InviteMembersResult,
  SendMessageInput,
  SendMessageResult,
  Session,
  SessionUser,
} from './types.js';

const LOGIN_PATH = '/login';
const VERIFY_PATH = '/api/auth/verify';
const ACCOUNTS_PATH = '/api/account/getAll';
const SEARCH_PHONE_PATH = '/api/search/searchNewContact';
const FRIEND_STATUS_PATH = '/api/conversation/friendRequestStatus';
const ADD_FRIEND_PATH = '/api/contact/addFriend';
const FRIEND_LIST_PATH = '/api/contact/filter';
const SEND_MESSAGE_PATH = '/api/message/sms';
const GROUP_INFO_BY_LINK_PATH = '/api/message/getGroupInfoByLink';
const INVITE_MEMBERS_PATH = '/api/conversation/inviteMembers';
const GROUP_MEMBERS_PATH = '/api/conversation/groupMember';

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
      method: 'POST',
      json: { searchKey: toInternationalPhone(phone), accountId },
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
      globalId: asString(profile.globalId) ?? asString(data.globalId),
      // Zalo returns 1/0; it is the authoritative friend flag for THIS account.
      isFriend: asBoolean(profile.isFr) ?? asBoolean(data.isFr),
      raw: profile,
    };
  }

  /**
   * Read every friend of one sale account.
   *
   * The workspace returns the friend list as a paged envelope. `pageSize` is
   * capped server-side at 10000, which is far above the largest observed list
   * (3650 friends), so one request normally returns everything; the loop below
   * only runs when a list actually exceeds the page.
   */
  async listFriends(accountId: string, options: { pageSize?: number; maxPages?: number } = {}): Promise<FriendListResult> {
    requireId(accountId, 'accountId');
    await this.#ensureSession();
    const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? 10_000), 1), 10_000);
    const maxPages = Math.max(Math.trunc(options.maxPages ?? 10), 1);

    const friends: FriendContact[] = [];
    const seen = new Set<string>();
    let totalElements: number | undefined;
    let complete = true;
    let lastRaw: unknown = null;

    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.#transport.request(FRIEND_LIST_PATH, {
        query: { searchKey: '', accountId, page, pageSize },
        headers: this.#authHeaders(),
      });
      const body = this.#unwrap(response, 'List friends');
      const data = asRecord(parseJsonValue(body.data)) ?? body;
      const items = extractList(data.content) ?? extractList(data.list) ?? extractList(data) ?? [];
      lastRaw = data;
      totalElements = asNumber(data.totalElements) ?? totalElements;

      let added = 0;
      for (const item of items) {
        const row = asRecord(item);
        if (!row) continue;
        const uid = asId(row.uid) ?? asId(row.userId);
        const globalId = asString(row.globalId);
        if (!uid || !globalId) continue;
        const key = `${globalId}:${uid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        friends.push({
          uid,
          globalId,
          displayName: asString(row.displayName),
          zaloName: asString(row.zaloName),
          raw: row,
        });
        added += 1;
      }

      if (added === 0 || items.length < pageSize) break;
      if (page === maxPages - 1) complete = false;
    }

    return { accountId, friends, complete, totalElements, raw: lastRaw };
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
    const data = unwrapNestedData(body) ?? {};
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
    const payload = unwrapNestedData(body) ?? {};
    // The workspace answers in two shapes: `{ data: { error_code, ... } }` and
    // `{ data: { error_code, error_message, data: { ... } } }`. Read both layers.
    const inner = asRecord(parseJsonValue(body.data)) ?? {};
    const layers = [payload, inner, body];
    const firstOf = <T>(pick: (layer: Record<string, unknown>) => T | undefined): T | undefined => {
      for (const layer of layers) {
        const value = pick(layer);
        if (value !== undefined) return value;
      }
      return undefined;
    };
    const code = firstOf((layer) => asNumber(field(layer, 'error_code') ?? field(layer, 'code')));
    const messageText = firstOf(
      (layer) => asString(field(layer, 'error_message') ?? field(layer, 'message')),
    );
    const isRequested = firstOf(
      (layer) => asBoolean(field(layer, 'is_requested') ?? field(layer, 'isRequested')),
    );
    const isFriend = firstOf((layer) => asBoolean(field(layer, 'is_friend') ?? field(layer, 'isFriend')));

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
    const data = unwrapNestedData(body) ?? body;
    const messageId =
      asId(data.cliMsgId) ?? asId(data.msgId) ?? asId(data.messageId) ?? asId(data.id) ?? asId(body.cliMsgId);
    return { messageId, raw: data };
  }

  /**
   * Resolve a Zalo group from its join link, e.g. `https://zalo.me/g/abc12345`.
   *
   * Contract observed in the workspace web client:
   * `GET /api/message/getGroupInfoByLink?accountId=...&link=...` and the group
   * object is returned under `body.data`.
   */
  async getGroupInfoByLink(accountId: string, link: string): Promise<GroupInfo | null> {
    requireId(accountId, 'accountId');
    if (!link?.trim()) throw new ZsmError('A group link is required.');
    await this.#ensureSession();
    const response = await this.#transport.request(GROUP_INFO_BY_LINK_PATH, {
      query: { accountId, link },
      headers: this.#authHeaders(),
    });
    const body = this.#unwrap(response, 'Get group info by link');
    const data = unwrapNestedData(body) ?? {};
    const groupId = asId(data.groupId) ?? asId(data.id) ?? asId(data.toId);
    if (!groupId) return null;
    return {
      groupId,
      name: asString(data.name) ?? asString(data.groupName) ?? asString(data.title),
      creatorId: asId(data.creatorId) ?? asId(data.creator_id),
      memberCount:
        asNumber(data.memberCount) ?? asNumber(data.totalMember) ?? asNumber(data.member_count),
      members: extractGroupMembers(data.currentMems ?? data.members),
      raw: data,
    };
  }

  /**
   * Invite (add) members to a group from one sale account.
   *
   * Contract observed in the workspace web client:
   * `POST /api/conversation/inviteMembers` with `{ groupId, accountId, membersId }`.
   * The endpoint mutates state; the SDK never retries it.
   */
  async inviteMembers(input: InviteMembersInput): Promise<InviteMembersResult> {
    requireId(input.accountId, 'accountId');
    requireId(input.groupId, 'groupId');
    const memberIds = [...new Set((input.memberIds || []).map((id) => String(id).trim()).filter(Boolean))];
    if (!memberIds.length) throw new ZsmError('At least one member id is required.');
    await this.#ensureSession();
    const response = await this.#transport.request(INVITE_MEMBERS_PATH, {
      method: 'POST',
      json: { groupId: input.groupId, accountId: input.accountId, membersId: memberIds },
      headers: this.#authHeaders(),
    });
    assertOk(response, 'Invite group members');
    const body = asRecord(response.json) ?? {};
    const envelope = asRecord(parseJsonValue(body.data)) ?? asRecord(body.data) ?? {};
    const data = unwrapNestedData(body) ?? {};
    const code =
      asNumber(field(envelope, 'error_code')) ?? asNumber(field(data, 'error_code')) ?? asNumber(body.error_code);
    const message =
      asString(field(envelope, 'error_message')) ??
      asString(field(data, 'error_message')) ??
      asString(body.error_message) ??
      asString(body.message);

    let status: InviteMembersResult['status'] = 'UNKNOWN';
    if (code === 0 || message === 'Successful.') status = 'INVITED';
    else if (message && /already|đã là thành viên|da la thanh vien|đã tham gia|da tham gia/i.test(message)) status = 'ALREADY_IN_GROUP';
    else if (code !== undefined && code !== 0) status = 'FAILED';

    return { status, code, message, raw: body };
  }

  /**
   * Check which of the supplied user ids are current members of a group.
   *
   * There is no dedicated membership endpoint: `POST /api/conversation/groupMember`
   * only resolves a user profile (it answers with a profile even when that user is
   * not in the group). Membership is therefore read from the group's own member
   * list returned by `getGroupInfoByLink` (`currentMems`).
   */
  async getGroupMembers(accountId: string, groupLink: string, memberIds: string[]): Promise<GroupMembersResult> {
    requireId(accountId, 'accountId');
    if (!groupLink?.trim()) throw new ZsmError('A group link is required to check membership.');
    const ids = [...new Set((memberIds || []).map((id) => String(id).trim()).filter(Boolean))];
    if (!ids.length) throw new ZsmError('At least one member id is required.');

    const info = await this.getGroupInfoByLink(accountId, groupLink);
    if (!info) throw new ApiError('Could not resolve the group link while checking membership.', { status: 200 });

    const allMembers = info.members ?? [];
    const present = new Set(allMembers.map((member) => String(member.id)));
    const matched = allMembers.filter((member) => ids.includes(String(member.id)));
    return {
      memberIds: ids.filter((id) => present.has(id)),
      members: matched,
      /** `true` when the workspace returned the full member list (no pagination). */
      complete: !asBoolean(info.raw.hasMoreMember),
      raw: info.raw,
    };
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

/**
 * The workspace wraps some responses twice:
 * `{ status, data: { error_code, error_message, data: {...} } }`.
 * Returns the innermost object, falling back to `body.data` then the body.
 */
function field(data: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : undefined;
}

function unwrapNestedData(body: Record<string, unknown>): Record<string, unknown> | undefined {
  const outer = asRecord(parseJsonValue(body.data)) ?? asRecord(body.data);
  if (!outer) return body;
  const inner = asRecord(parseJsonValue(outer.data)) ?? asRecord(outer.data);
  if (inner) return inner;
  const { error_code: _code, error_message: _message, ...rest } = outer;
  return rest;
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

function extractGroupMembers(value: unknown): GroupMember[] {
  const list = Array.isArray(value) ? value : extractList(value);
  if (!list) return [];
  return list
    .map((item): GroupMember | undefined => {
      const raw = asRecord(item);
      if (!raw) return undefined;
      const id = asId(raw.id) ?? asId(raw.userId) ?? asId(raw.uid) ?? asId(raw.memberId);
      if (!id) return undefined;
      return {
        id,
        name: asString(raw.name) ?? asString(raw.displayName) ?? asString(raw.swName),
        raw,
      };
    })
    .filter((member): member is GroupMember => member !== undefined);
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
