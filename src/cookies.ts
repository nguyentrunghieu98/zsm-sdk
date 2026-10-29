interface StoredCookie {
  name: string;
  value: string;
  /** Lowercase, without a leading dot. */
  domain: string;
  hostOnly: boolean;
  path: string;
  secure: boolean;
  expiresAt?: number;
}

const SPLIT_RE = /(?:^|,)\s*(?=[^;,=\s]+=)/;

/**
 * Minimal RFC 6265 cookie jar.
 *
 * The workspace login sets a domain cookie on the login host and expects it on
 * the workspace subdomain, so a host-only jar is not enough. This jar keeps the
 * attributes needed for that flow and nothing else.
 */
export class CookieJar {
  #cookies = new Map<string, StoredCookie>();

  clear(): void {
    this.#cookies.clear();
  }

  addFromResponse(url: string, headers: Headers): void {
    const raw = getSetCookie(headers);
    if (!raw.length) return;
    const request = new URL(url);
    for (const line of raw) {
      const parsed = parseSetCookie(line, request);
      if (!parsed) continue;
      const key = `${parsed.name}|${parsed.domain}|${parsed.path}`;
      if (isExpired(parsed)) {
        this.#cookies.delete(key);
      } else {
        this.#cookies.set(key, parsed);
      }
    }
  }

  headerFor(url: string): string | undefined {
    const target = new URL(url);
    const host = target.hostname.toLowerCase();
    const path = target.pathname || '/';
    const secure = target.protocol === 'https:';
    const now = Date.now();
    const matches: StoredCookie[] = [];
    for (const cookie of this.#cookies.values()) {
      if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) continue;
      if (cookie.secure && !secure) continue;
      if (!domainMatches(host, cookie)) continue;
      if (!pathMatches(path, cookie.path)) continue;
      matches.push(cookie);
    }
    if (!matches.length) return undefined;
    matches.sort((a, b) => b.path.length - a.path.length || b.domain.length - a.domain.length);
    return matches.map((c) => `${c.name}=${c.value}`).join('; ');
  }

  /** Test helper: number of stored cookies. */
  get size(): number {
    return this.#cookies.size;
  }
}

function getSetCookie(headers: Headers): string[] {
  const extended = headers as unknown as { getSetCookie?: () => string[] };
  if (typeof extended.getSetCookie === 'function') return extended.getSetCookie();
  const combined = headers.get('set-cookie');
  if (!combined) return [];
  return combined.split(SPLIT_RE).map((part) => part.trim()).filter(Boolean);
}

function parseSetCookie(line: string, request: URL): StoredCookie | undefined {
  const segments = line.split(';');
  const pair = segments.shift()?.trim();
  if (!pair) return undefined;
  const eq = pair.indexOf('=');
  if (eq <= 0) return undefined;
  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  if (!name) return undefined;

  let domain = request.hostname.toLowerCase();
  let hostOnly = true;
  let path = defaultPath(request.pathname);
  let secure = false;
  let expiresAt: number | undefined;

  for (const segment of segments) {
    const attr = segment.trim();
    if (!attr) continue;
    const idx = attr.indexOf('=');
    const key = (idx === -1 ? attr : attr.slice(0, idx)).trim().toLowerCase();
    const val = idx === -1 ? '' : attr.slice(idx + 1).trim();
    switch (key) {
      case 'domain': {
        const candidate = val.replace(/^\./, '').toLowerCase();
        if (!candidate) break;
        if (!domainMatches(request.hostname.toLowerCase(), { domain: candidate, hostOnly: false })) return undefined;
        domain = candidate;
        hostOnly = false;
        break;
      }
      case 'path':
        if (val.startsWith('/')) path = val;
        break;
      case 'secure':
        secure = true;
        break;
      case 'max-age': {
        const seconds = Number.parseInt(val, 10);
        if (Number.isFinite(seconds)) expiresAt = Date.now() + seconds * 1000;
        break;
      }
      case 'expires': {
        const ts = Date.parse(val);
        if (Number.isFinite(ts)) expiresAt = ts;
        break;
      }
      default:
        break;
    }
  }

  return { name, value, domain, hostOnly, path, secure, expiresAt };
}

function isExpired(cookie: StoredCookie): boolean {
  return cookie.expiresAt !== undefined && cookie.expiresAt <= Date.now();
}

function domainMatches(host: string, cookie: Pick<StoredCookie, 'domain' | 'hostOnly'>): boolean {
  if (cookie.hostOnly) return host === cookie.domain;
  return host === cookie.domain || host.endsWith(`.${cookie.domain}`);
}

function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  if (cookiePath.endsWith('/')) return true;
  return requestPath[cookiePath.length] === '/';
}

function defaultPath(pathname: string): string {
  if (!pathname.startsWith('/')) return '/';
  const lastSlash = pathname.lastIndexOf('/');
  if (lastSlash <= 0) return '/';
  return pathname.slice(0, lastSlash);
}

/** Parse a JWT payload without verifying the signature. */
export function parseJwtExpiry(token: string): number | undefined {
  const parts = token.split('.');
  if (parts.length < 2) return undefined;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const payload = JSON.parse(json) as { exp?: unknown };
    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) return payload.exp * 1000;
  } catch {
    return undefined;
  }
  return undefined;
}
