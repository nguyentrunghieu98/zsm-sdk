"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Transport = void 0;
exports.stripTrailingSlash = stripTrailingSlash;
exports.assertOk = assertOk;
const errors_js_1 = require("./errors.js");
const cookies_js_1 = require("./cookies.js");
const DEFAULT_USER_AGENT = 'zsm-sdk/0.1 (+https://github.com/nguyentrunghieu98/zsm-sdk)';
class Transport {
    cookies = new cookies_js_1.CookieJar();
    #options;
    constructor(options) {
        this.#options = options;
    }
    get baseUrl() {
        return stripTrailingSlash(this.#options.baseUrl);
    }
    get loginUrl() {
        return stripTrailingSlash(this.#options.loginUrl);
    }
    url(pathOrUrl) {
        if (/^https?:\/\//i.test(pathOrUrl))
            return pathOrUrl;
        return `${this.baseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
    }
    async request(pathOrUrl, options = {}) {
        const target = new URL(this.url(pathOrUrl));
        if (options.query) {
            for (const [key, value] of Object.entries(options.query)) {
                if (value === undefined || value === null)
                    continue;
                target.searchParams.set(key, String(value));
            }
        }
        return this.#follow(target.toString(), options);
    }
    async #follow(url, options) {
        let currentUrl = url;
        let method = options.method ?? 'GET';
        let body = encodeBody(options);
        const visited = [];
        let firstHop = true;
        for (let hop = 0; hop < 10; hop += 1) {
            const headers = new Headers();
            headers.set('accept', 'application/json, text/plain, */*');
            headers.set('user-agent', this.#options.userAgent ?? DEFAULT_USER_AGENT);
            const cookie = this.cookies.headerFor(currentUrl);
            if (cookie)
                headers.set('cookie', cookie);
            if (options.headers) {
                for (const [key, value] of Object.entries(options.headers))
                    headers.set(key, value);
            }
            if (firstHop && options.firstHopHeaders) {
                for (const [key, value] of Object.entries(options.firstHopHeaders))
                    headers.set(key, value);
            }
            if (body && !headers.has('content-type')) {
                headers.set('content-type', options.form ? 'application/x-www-form-urlencoded' : 'application/json');
            }
            const response = await this.#requestOnce(currentUrl, {
                method,
                headers,
                body,
            });
            visited.push(currentUrl);
            this.cookies.addFromResponse(currentUrl, response.headers);
            const location = response.headers.get('location');
            const isRedirect = response.status >= 300 && response.status < 400 && location;
            if (!isRedirect) {
                return {
                    status: response.status,
                    url: currentUrl,
                    headers: response.headers,
                    text: response.text,
                    json: parseJson(response.text, response.headers),
                    visited,
                };
            }
            const next = new URL(location, currentUrl).toString();
            if (response.status === 303 || ((response.status === 301 || response.status === 302) && method !== 'GET')) {
                method = 'GET';
                body = undefined;
            }
            currentUrl = next;
            firstHop = false;
        }
        throw new errors_js_1.ZsmError('Too many redirects while talking to the workspace.');
    }
    async #requestOnce(url, init) {
        let response;
        try {
            response = await this.#options.fetch(url, {
                method: init.method,
                headers: init.headers,
                body: init.body,
                redirect: 'manual',
                signal: AbortSignal.timeout(this.#options.timeoutMs),
            });
        }
        catch (error) {
            if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
                throw new errors_js_1.ZsmError(`Workspace request timed out after ${this.#options.timeoutMs}ms.`, { cause: error });
            }
            throw new errors_js_1.ZsmError('Network error while talking to the workspace.', { cause: error });
        }
        const text = await response.text();
        return { status: response.status, headers: response.headers, text };
    }
}
exports.Transport = Transport;
function encodeBody(options) {
    if (options.json !== undefined)
        return JSON.stringify(options.json);
    if (options.form)
        return new URLSearchParams(options.form).toString();
    return undefined;
}
function parseJson(text, headers) {
    if (!text)
        return undefined;
    const type = headers.get('content-type') ?? '';
    const looksJson = type.includes('json') || /^\s*[{[]/.test(text);
    if (!looksJson)
        return undefined;
    try {
        return JSON.parse(text);
    }
    catch {
        return undefined;
    }
}
function stripTrailingSlash(value) {
    return value.replace(/\/+$/, '');
}
/** Throw for non-2xx responses, keeping a short sanitized body for diagnostics. */
function assertOk(response, context = 'Workspace request') {
    if (response.status >= 200 && response.status < 300)
        return;
    const safe = sanitizeBody(response.text);
    throw new errors_js_1.HttpError(response.status, safe, context);
}
function sanitizeBody(text) {
    const compact = text.replace(/\s+/g, ' ').trim();
    if (compact.length <= 300)
        return compact;
    return `${compact.slice(0, 300)}…`;
}
