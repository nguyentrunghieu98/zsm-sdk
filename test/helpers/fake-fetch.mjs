/** Tiny routing helper for mocked fetch calls. */

export function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers ?? {}) },
  });
}

export function html(body, init = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...(init.headers ?? {}) },
  });
}

export function redirect(location, init = {}) {
  return new Response(null, {
    status: init.status ?? 302,
    headers: { location, ...(init.headers ?? {}) },
  });
}

export function cookie(name, value, attributes = 'Path=/; Secure; HttpOnly') {
  return { 'set-cookie': `${name}=${value}; ${attributes}` };
}

/**
 * Build a fake fetch from ordered handlers.
 * A handler is `{ match(url: URL, init), respond(call) }`.
 */
export function fakeFetch(handlers) {
  const calls = [];
  const fetch = async (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input.toString();
    const url = new URL(rawUrl);
    const headers = new Headers(init.headers ?? {});
    const call = {
      url: rawUrl,
      method: String(init.method ?? 'GET').toUpperCase(),
      path: url.pathname,
      search: url.search,
      headers,
      body: typeof init.body === 'string' ? init.body : undefined,
    };
    calls.push(call);
    for (const handler of handlers) {
      if (handler.match(url, call)) return handler.respond(call);
    }
    throw new Error(`Unexpected request in test: ${call.method} ${rawUrl}`);
  };
  return { fetch, calls };
}

export function jwt(payload, header = { alg: 'none', typ: 'JWT' }) {
  const encode = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${encode(header)}.${encode(payload)}.signature`;
}
