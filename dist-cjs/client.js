"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZsmClient = void 0;
const errors_js_1 = require("./errors.js");
const http_js_1 = require("./http.js");
const cookies_js_1 = require("./cookies.js");
const utils_js_1 = require("./utils.js");
const LOGIN_PATH = '/login';
const VERIFY_PATH = '/api/auth/verify';
const ACCOUNTS_PATH = '/api/account/getAll';
const SEARCH_PHONE_PATH = '/api/search/searchByPhoneAndAccount';
const FRIEND_STATUS_PATH = '/api/conversation/friendRequestStatus';
const ADD_FRIEND_PATH = '/api/contact/addFriend';
const SEND_MESSAGE_PATH = '/api/message/sms';
/** Re-verify the session this long before the access token expires. */
const VERIFY_MARGIN_MS = 30 * 60 * 1000;
class ZsmClient {
    #transport;
    #baseUrl;
    #loginTarget;
    #session = null;
    constructor(options) {
        if (!options.baseUrl)
            throw new errors_js_1.ZsmError('`baseUrl` is required.');
        if (!options.loginUrl)
            throw new errors_js_1.ZsmError('`loginUrl` is required.');
        const injectedFetch = options.fetch ?? globalThis.fetch;
        if (typeof injectedFetch !== 'function') {
            throw new errors_js_1.ZsmError('No fetch implementation available. Pass `fetch` in ClientOptions.');
        }
        this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
        if (!options.loginTarget)
            throw new errors_js_1.ZsmError('`loginTarget` is required.');
        this.#loginTarget = options.loginTarget;
        this.#transport = new http_js_1.Transport({
            baseUrl: this.#baseUrl,
            loginUrl: options.loginUrl,
            timeoutMs: options.timeoutMs ?? 20_000,
            fetch: injectedFetch,
            userAgent: options.userAgent,
        });
    }
    get session() {
        return this.#session;
    }
    /** Reuse a previously persisted session (for example from a credential store). */
    useSession(session) {
        if (!session.accessToken)
            throw new errors_js_1.ZsmError('Session must contain an accessToken.');
        this.#session = { ...session };
    }
    /** Drop the in-memory session and cookies. */
    logout() {
        this.#session = null;
        this.#transport.cookies.clear();
    }
    /**
     * Log in with the username/password form and establish a workspace session.
     *
     * The form posts to the provider login host. The resulting session cookie is
     * then exchanged for an access token by the workspace verify endpoint.
     */
    async login(credentials) {
        if (!credentials?.username || !credentials?.password) {
            throw new errors_js_1.ZsmError('Both username and password are required.');
        }
        this.#session = null;
        const loginUrl = `${this.#transport.loginUrl}${LOGIN_PATH}?target=${encodeURIComponent(this.#loginTarget)}`;
        const page = await this.#transport.request(loginUrl, { method: 'GET' });
        if (page.status < 200 || page.status >= 400) {
            throw new errors_js_1.AuthenticationError(`Login page is unavailable (HTTP ${page.status}).`, { status: page.status });
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
            throw new errors_js_1.InvalidCredentialsError();
        }
        if (posted.status >= 400 && !this.#transport.cookies.size) {
            throw new errors_js_1.AuthenticationError(`Login request failed (HTTP ${posted.status}).`, { status: posted.status });
        }
        try {
            return await this.verify();
        }
        catch (error) {
            if (error instanceof errors_js_1.AuthenticationError) {
                throw new errors_js_1.InvalidCredentialsError('Login did not produce an authenticated workspace session. The account may need MFA/CAPTCHA, or the login flow changed.');
            }
            throw error;
        }
    }
    /** Adopt an access token obtained elsewhere (browser session, credential store). */
    async loginWithToken(accessToken) {
        if (!accessToken)
            throw new errors_js_1.ZsmError('An access token is required.');
        this.#session = { accessToken };
        return this.verify();
    }
    /** Call the verify endpoint and refresh the in-memory session. */
    async verify() {
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
            throw new errors_js_1.AuthenticationError(error?.message ?? `Session verification failed (HTTP ${response.status}).`, {
                status: response.status,
                code: error?.code,
            });
        }
        const body = (0, utils_js_1.asRecord)(response.json);
        const payload = (0, utils_js_1.asRecord)(body?.data) ?? body;
        if (!payload)
            throw new errors_js_1.AuthenticationError('Verify response is not a JSON object.');
        const accessToken = (0, utils_js_1.asString)(payload.accessToken) ?? (0, utils_js_1.asString)(body?.accessToken);
        if (!accessToken)
            throw new errors_js_1.AuthenticationError('Verify response did not contain an access token.');
        const session = {
            accessToken,
            loginV2Token: (0, utils_js_1.asString)(payload.loginV2Token),
            ctoken: (0, utils_js_1.asString)(payload.ctoken),
            sessionId: (0, utils_js_1.asString)(payload.sessionId),
            user: (0, utils_js_1.asRecord)(payload.user),
            permissions: (0, utils_js_1.parsePermissions)(payload.permissions),
            expiresAt: (0, cookies_js_1.parseJwtExpiry)(accessToken) ?? (0, utils_js_1.asNumber)(payload.expiresAt),
            raw: payload,
        };
        this.#session = session;
        return session;
    }
    /** List the chat accounts the signed-in workspace user can operate. */
    async listAccounts() {
        await this.#ensureSession();
        const response = await this.#transport.request(ACCOUNTS_PATH, { headers: this.#authHeaders() });
        const body = this.#unwrap(response, 'List accounts');
        const data = (0, utils_js_1.parseJsonValue)(body.data);
        const items = extractList(data) ?? extractList(body.accounts) ?? [];
        return items
            .map((item) => normalizeAccount(item))
            .filter((account) => account !== undefined);
    }
    /** Find a contact by phone number, using one sale account to search. */
    async findUserByPhone(accountId, phone) {
        requireId(accountId, 'accountId');
        if (!phone?.trim())
            throw new errors_js_1.ZsmError('A phone number is required.');
        await this.#ensureSession();
        const response = await this.#transport.request(SEARCH_PHONE_PATH, {
            query: { searchKey: (0, utils_js_1.toInternationalPhone)(phone), accountId },
            headers: this.#authHeaders(),
        });
        const body = this.#unwrap(response, 'Find user by phone');
        const data = (0, utils_js_1.asRecord)((0, utils_js_1.parseJsonValue)(body.data)) ?? (0, utils_js_1.asRecord)(body);
        if (!data)
            return null;
        const profile = (0, utils_js_1.asRecord)((0, utils_js_1.parseJsonValue)(data.profile)) ?? (0, utils_js_1.asRecord)((0, utils_js_1.parseJsonValue)(data.user)) ?? data;
        const conversation = (0, utils_js_1.asRecord)((0, utils_js_1.parseJsonValue)(data.conversation));
        const userId = (0, utils_js_1.asId)(profile.userId) ??
            (0, utils_js_1.asId)(profile.uid) ??
            (0, utils_js_1.asId)(data.userId) ??
            (0, utils_js_1.asId)(data.uid) ??
            (0, utils_js_1.asId)(conversation?.userId);
        if (!userId)
            return null;
        return {
            userId,
            name: (0, utils_js_1.asString)(profile.name) ?? (0, utils_js_1.asString)(profile.displayName),
            avatar: (0, utils_js_1.asString)(profile.avatar) ?? (0, utils_js_1.asString)(profile.avatarUrl),
            conversationId: (0, utils_js_1.asId)(data.conversationId) ?? (0, utils_js_1.asId)(conversation?.id),
            raw: profile,
        };
    }
    /** Read the current friendship / pending-request state for a contact. */
    async getFriendRequestStatus(accountId, userId) {
        requireId(accountId, 'accountId');
        requireId(userId, 'userId');
        await this.#ensureSession();
        const response = await this.#transport.request(FRIEND_STATUS_PATH, {
            method: 'POST',
            json: { accountId, friendId: userId },
            headers: this.#authHeaders(),
        });
        const body = this.#unwrap(response, 'Friend request status');
        const data = (0, utils_js_1.asRecord)((0, utils_js_1.parseJsonValue)(body.data)) ?? body;
        return { status: normalizeFriendStatus(data), raw: data };
    }
    /**
     * Send a friend request from one sale account.
     *
     * The endpoint mutates state despite using GET, so the SDK never retries it.
     * Business-level codes are returned to the caller instead of being thrown.
     */
    async sendFriendRequest(accountId, userId, message) {
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
        (0, http_js_1.assertOk)(response, 'Send friend request');
        const body = (0, utils_js_1.asRecord)(response.json) ?? {};
        const payload = (0, utils_js_1.asRecord)((0, utils_js_1.parseJsonValue)(body.data)) ?? body;
        const code = (0, utils_js_1.asNumber)(payload.error_code) ?? (0, utils_js_1.asNumber)(body.error_code);
        const messageText = (0, utils_js_1.asString)(payload.error_message) ?? (0, utils_js_1.asString)(body.error_message);
        const isRequested = (0, utils_js_1.asBoolean)(payload.is_requested) ?? (0, utils_js_1.asBoolean)(payload.isRequested) ?? (0, utils_js_1.asBoolean)(body.is_requested);
        const isFriend = (0, utils_js_1.asBoolean)(payload.is_friend) ?? (0, utils_js_1.asBoolean)(payload.isFriend) ?? (0, utils_js_1.asBoolean)(body.is_friend) ?? (0, utils_js_1.asBoolean)(body.isFriend);
        let status;
        if (code === 222) {
            status = 'ALREADY_FRIENDS';
        }
        else if (code !== undefined && code !== 0) {
            status = 'UNKNOWN';
        }
        else if (isFriend) {
            status = 'ALREADY_FRIENDS';
        }
        else if (isRequested === false) {
            status = 'ALREADY_INVITED';
        }
        else {
            status = 'INVITED';
        }
        return { status, code, message: messageText, raw: payload };
    }
    /** Send a text message from one sale account to a contact. */
    async sendMessage(input) {
        requireId(input.accountId, 'accountId');
        requireId(input.toId, 'toId');
        if (!input.message?.trim())
            throw new errors_js_1.ZsmError('A message is required.');
        await this.#ensureSession();
        const response = await this.#transport.request(SEND_MESSAGE_PATH, {
            method: 'POST',
            json: { accountId: input.accountId, toId: input.toId, message: input.message },
            headers: this.#authHeaders(),
        });
        const body = this.#unwrap(response, 'Send message');
        const data = (0, utils_js_1.asRecord)((0, utils_js_1.parseJsonValue)(body.data)) ?? body;
        const messageId = (0, utils_js_1.asId)(data.cliMsgId) ?? (0, utils_js_1.asId)(data.msgId) ?? (0, utils_js_1.asId)(data.messageId) ?? (0, utils_js_1.asId)(data.id) ?? (0, utils_js_1.asId)(body.cliMsgId);
        return { messageId, raw: data };
    }
    async #ensureSession() {
        if (!this.#session?.accessToken)
            throw new errors_js_1.SessionRequiredError();
        const expiresAt = this.#session.expiresAt;
        if (expiresAt !== undefined && Date.now() >= expiresAt - VERIFY_MARGIN_MS) {
            await this.verify();
        }
    }
    #authHeaders() {
        const token = this.#session?.accessToken;
        return token ? { authorization: `Bearer ${token}` } : {};
    }
    #unwrap(response, context) {
        (0, http_js_1.assertOk)(response, context);
        const body = (0, utils_js_1.asRecord)(response.json);
        if (!body) {
            if (!response.text.trim())
                return {};
            throw new errors_js_1.ApiError(`${context}: workspace returned a non-JSON response.`, { status: response.status });
        }
        const error = envelopeError(response);
        if (error)
            throw new errors_js_1.ApiError(`${context}: ${error.message}`, { code: error.code, status: response.status });
        return body;
    }
}
exports.ZsmClient = ZsmClient;
function isSuccessful(response) {
    return response.status >= 200 && response.status < 300;
}
function isUsableSessionResponse(response) {
    if (!isSuccessful(response) || envelopeError(response))
        return false;
    const body = (0, utils_js_1.asRecord)(response.json);
    const payload = (0, utils_js_1.asRecord)(body?.data) ?? body;
    return Boolean((0, utils_js_1.asString)(payload?.accessToken) ?? (0, utils_js_1.asString)(body?.accessToken));
}
function wasRejected(response) {
    const urls = [...response.visited, response.url];
    return urls.some((url) => {
        try {
            return new URL(url).searchParams.get('error') === 'true';
        }
        catch {
            return false;
        }
    });
}
function envelopeError(response) {
    const body = (0, utils_js_1.asRecord)(response.json);
    if (!body) {
        if (response.status >= 400) {
            return { message: `Workspace returned HTTP ${response.status}.`, code: response.status };
        }
        return undefined;
    }
    if (body.status === 'error' || body.success === false) {
        const error = (0, utils_js_1.asRecord)(body.error);
        return {
            message: (0, utils_js_1.asString)(error?.message) ?? (0, utils_js_1.asString)(body.error_message) ?? (0, utils_js_1.asString)(body.message) ?? 'Workspace returned an error.',
            code: (0, utils_js_1.asId)(error?.code) ?? (0, utils_js_1.asId)(body.code) ?? (0, utils_js_1.asId)(body.error_code),
        };
    }
    const rootCode = (0, utils_js_1.asNumber)(body.error_code);
    if (rootCode !== undefined && rootCode !== 0) {
        return {
            message: (0, utils_js_1.asString)(body.error_message) ?? (0, utils_js_1.asString)(body.message) ?? `Workspace error ${rootCode}.`,
            code: rootCode,
        };
    }
    const data = (0, utils_js_1.asRecord)(body.data);
    const dataCode = (0, utils_js_1.asNumber)(data?.error_code);
    if (dataCode !== undefined && dataCode !== 0) {
        return {
            message: (0, utils_js_1.asString)(data?.error_message) ?? (0, utils_js_1.asString)(body.error_message) ?? `Workspace error ${dataCode}.`,
            code: dataCode,
        };
    }
    return undefined;
}
function extractList(value) {
    const parsed = (0, utils_js_1.parseJsonValue)(value);
    if (Array.isArray(parsed))
        return parsed;
    const record = (0, utils_js_1.asRecord)(parsed);
    if (!record)
        return undefined;
    for (const key of ['content', 'items', 'rows', 'accounts']) {
        if (Array.isArray(record[key]))
            return record[key];
    }
    return undefined;
}
function normalizeAccount(item) {
    const raw = (0, utils_js_1.asRecord)(item);
    if (!raw)
        return undefined;
    const accountId = (0, utils_js_1.asId)(raw.accountId) ?? (0, utils_js_1.asId)(raw.account_id) ?? (0, utils_js_1.asId)(raw.id) ?? (0, utils_js_1.asId)(raw.uuid);
    if (!accountId)
        return undefined;
    return {
        accountId,
        name: (0, utils_js_1.asString)(raw.name) ??
            (0, utils_js_1.asString)(raw.fullName) ??
            (0, utils_js_1.asString)(raw.displayName) ??
            (0, utils_js_1.asString)(raw.accountName) ??
            (0, utils_js_1.asString)(raw.alias),
        avatar: (0, utils_js_1.asString)(raw.avatar) ?? (0, utils_js_1.asString)(raw.avatarUrl) ?? (0, utils_js_1.asString)(raw.image) ?? (0, utils_js_1.asString)(raw.profilePicture),
        status: ((0, utils_js_1.asString)(raw.status) ?? (0, utils_js_1.asNumber)(raw.status) ?? (0, utils_js_1.asString)(raw.sessionStatus) ?? (0, utils_js_1.asNumber)(raw.active)),
        raw,
    };
}
function normalizeFriendStatus(data) {
    const explicit = (0, utils_js_1.asString)(data.status) ??
        (0, utils_js_1.asString)(data.friendStatus) ??
        (0, utils_js_1.asString)(data.friend_status) ??
        (0, utils_js_1.asString)(data.state);
    if (explicit) {
        const normalized = explicit.toUpperCase();
        if (normalized.includes('INVITE') || normalized.includes('REQUEST') || normalized.includes('PENDING')) {
            return normalized.includes('ALREADY') ? 'ALREADY_INVITED' : 'INVITED';
        }
        if (normalized.includes('FRIEND') || normalized.includes('ACCEPT'))
            return 'ALREADY_FRIENDS';
        if (normalized.includes('NONE'))
            return 'NONE';
    }
    const isFriend = (0, utils_js_1.asBoolean)(data.isFriend) ?? (0, utils_js_1.asBoolean)(data.is_friend) ?? (0, utils_js_1.asBoolean)(data.friend);
    if (isFriend)
        return 'ALREADY_FRIENDS';
    const isRequested = (0, utils_js_1.asBoolean)(data.isRequested) ?? (0, utils_js_1.asBoolean)(data.is_requested) ?? (0, utils_js_1.asBoolean)(data.requested);
    if (isRequested)
        return 'INVITED';
    if (isFriend === false)
        return 'NONE';
    return 'UNKNOWN';
}
function requireId(value, field) {
    if (!value || !value.trim())
        throw new errors_js_1.ZsmError(`\`${field}\` is required.`);
}
