import { createFileRoute } from "@tanstack/react-router";

/**
 * Fenêtre interne « session » : chaque fenêtre possède son propre identifiant (sid).
 * Les cookies du site distant sont réécrits en cookies de notre origine, limités au
 * chemin /api/public/px/<sid>/ : deux fenêtres différentes ne partagent donc jamais
 * leur session. Les formulaires (connexions) sont relayés en POST avec ces cookies.
 */

const PREFIX = "/api/public/px/";

const DROP_RESPONSE = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
  "strict-transport-security",
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "set-cookie",
  "report-to",
  "reporting-endpoints",
  "permissions-policy",
  "link",
]);

const DROP_REQUEST = new Set([
  "host",
  "cookie",
  "connection",
  "content-length",
  "origin",
  "referer",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
]);

interface Parsed {
  sid: string;
  target: URL;
  base: string;
}

function parse(requestUrl: string): Parsed | null {
  const incoming = new URL(requestUrl);
  if (!incoming.pathname.startsWith(PREFIX)) return null;
  const rest = incoming.pathname.slice(PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const sid = rest.slice(0, slash).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!sid) return null;
  let remainder = rest.slice(slash + 1);
  let protocol = "https";
  if (remainder.startsWith("http/")) {
    protocol = "http";
    remainder = remainder.slice(5);
  } else if (remainder.startsWith("https/")) {
    remainder = remainder.slice(6);
  }
  if (!remainder) return null;
  try {
    const target = new URL(`${protocol}://${remainder}${incoming.search}`);
    return { sid, target, base: `${PREFIX}${sid}/` };
  } catch {
    return null;
  }
}

function proxiedPath(sid: string, absolute: URL): string {
  const scheme = absolute.protocol === "http:" ? "http" : "https";
  return `${PREFIX}${sid}/${scheme}/${absolute.host}${absolute.pathname}${absolute.search}${absolute.hash}`;
}

function rewriteOne(raw: string, target: URL, sid: string): string {
  const value = raw.trim();
  if (
    !value ||
    value.startsWith("#") ||
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    value.startsWith("javascript:") ||
    value.startsWith("mailto:") ||
    value.startsWith("tel:") ||
    value.startsWith(PREFIX)
  ) {
    return raw;
  }
  try {
    const absolute = new URL(value, target);
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:") return raw;
    return proxiedPath(sid, absolute);
  } catch {
    return raw;
  }
}

function rewriteSrcset(raw: string, target: URL, sid: string): string {
  return raw
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return part;
      const [candidate, ...descriptors] = trimmed.split(/\s+/);
      return [rewriteOne(candidate ?? "", target, sid), ...descriptors].join(" ");
    })
    .join(", ");
}

function clientScript(sid: string, targetOrigin: string): string {
  return `
(function () {
  var PREFIX = ${JSON.stringify(`${PREFIX}${sid}/`)};
  var ORIGIN = ${JSON.stringify(targetOrigin)};
  function px(input) {
    try {
      if (typeof input !== 'string') return input;
      if (!input || input.indexOf(PREFIX) === 0) return input;
      if (/^(data|blob|javascript|mailto|tel):/i.test(input) || input.charAt(0) === '#') return input;
      var u = new URL(input, document.baseURI);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return input;
      if (u.pathname.indexOf(PREFIX) === 0) return u.pathname + u.search + u.hash;
      var scheme = u.protocol === 'http:' ? 'http' : 'https';
      return PREFIX + scheme + '/' + u.host + u.pathname + u.search + u.hash;
    } catch (e) { return input; }
  }
  window.__px = px;
  var nativeFetch = window.fetch;
  window.fetch = function (resource, init) {
    try {
      if (typeof resource === 'string') resource = px(resource);
      else if (resource && resource.url) resource = new Request(px(resource.url), resource);
    } catch (e) {}
    init = init || {};
    if (init.credentials === undefined) init.credentials = 'same-origin';
    return nativeFetch.call(window, resource, init);
  };
  var open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments);
    args[1] = px(url);
    return open.apply(this, args);
  };
  ['pushState', 'replaceState'].forEach(function (name) {
    var fn = history[name];
    history[name] = function (state, title, url) {
      return url ? fn.call(history, state, title, px(url)) : fn.call(history, state, title);
    };
  });
  window.open = function (url) { if (url) window.location.href = px(url); return window; };
  function fixNode(node) {
    if (!node || node.nodeType !== 1) return;
    ['href', 'src', 'action', 'poster', 'formaction'].forEach(function (attr) {
      var v = node.getAttribute && node.getAttribute(attr);
      if (v) { var n = px(v); if (n !== v) node.setAttribute(attr, n); }
    });
    if (node.querySelectorAll) {
      node.querySelectorAll('[href],[src],[action],[poster],[formaction]').forEach(fixNode);
    }
  }
  new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes && record.addedNodes.forEach(fixNode);
      if (record.type === 'attributes') fixNode(record.target);
    });
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'src', 'action', 'poster', 'formaction'] });
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.getAttribute) return;
    var action = form.getAttribute('action');
    if (action) { var n = px(action); if (n !== action) form.setAttribute('action', n); }
    else form.setAttribute('action', px(ORIGIN + window.location.pathname.replace(PREFIX, '')));
  }, true);
})();
`;
}

function rewriteHtml(html: string, target: URL, sid: string): string {
  let out = html
    .replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, "")
    .replace(/<base[^>]*>/gi, "")
    .replace(/\sintegrity=(["'])[^"']*\1/gi, "")
    .replace(/\snonce=(["'])[^"']*\1/gi, "");

  out = out.replace(
    /\s(href|src|action|poster|formaction|data-src)=(["'])([^"']*)\2/gi,
    (_match, attr: string, quote: string, value: string) =>
      ` ${attr}=${quote}${rewriteOne(value, target, sid)}${quote}`,
  );
  out = out.replace(
    /\s(srcset|imagesrcset)=(["'])([^"']*)\2/gi,
    (_match, attr: string, quote: string, value: string) =>
      ` ${attr}=${quote}${rewriteSrcset(value, target, sid)}${quote}`,
  );
  out = out.replace(/url\((["']?)([^)"']+)\1\)/gi, (match, quote: string, value: string) =>
    value.startsWith("data:") ? match : `url(${quote}${rewriteOne(value, target, sid)}${quote})`,
  );

  const injection = `<script>${clientScript(sid, target.origin)}</script>`;
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (match) => `${match}${injection}`);
  } else {
    out = injection + out;
  }
  return out;
}

function rewriteCss(css: string, target: URL, sid: string): string {
  return css
    .replace(/url\((["']?)([^)"']+)\1\)/gi, (match, quote: string, value: string) =>
      value.startsWith("data:") ? match : `url(${quote}${rewriteOne(value, target, sid)}${quote})`,
    )
    .replace(/@import\s+(["'])([^"']+)\1/gi, (_m, quote: string, value: string) => {
      return `@import ${quote}${rewriteOne(value, target, sid)}${quote}`;
    });
}

/** Cookies de notre origine -> cookies du site distant (préfixe retiré). */
function upstreamCookieHeader(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const jar = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("px_"))
    .map((part) => part.slice(3));
  return jar.length ? jar.join("; ") : null;
}

/** Set-Cookie distant -> cookie de notre origine limité au chemin de la fenêtre. */
function localSetCookie(raw: string, sid: string): string | null {
  const [pair] = raw.split(";");
  if (!pair || !pair.includes("=")) return null;
  const trimmed = pair.trim();
  const attributes = [`px_${trimmed}`, `Path=${PREFIX}${sid}/`, "Secure", "SameSite=None"];
  const expires = /(?:^|;)\s*expires=([^;]+)/i.exec(raw);
  const maxAge = /(?:^|;)\s*max-age=([^;]+)/i.exec(raw);
  if (maxAge?.[1]) attributes.push(`Max-Age=${maxAge[1].trim()}`);
  else if (expires?.[1]) attributes.push(`Expires=${expires[1].trim()}`);
  return attributes.join("; ");
}

async function handle(request: Request): Promise<Response> {
  const parsed = parse(request.url);
  if (!parsed) return new Response("Fenêtre invalide", { status: 400 });
  const { sid, target } = parsed;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!DROP_REQUEST.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set("Accept-Encoding", "identity");
  if (!headers.has("user-agent")) {
    headers.set(
      "User-Agent",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    );
  }
  headers.set("Referer", target.origin + "/");
  headers.set("Origin", target.origin);
  const cookie = upstreamCookieHeader(request);
  if (cookie) headers.set("Cookie", cookie);

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method,
      headers,
      redirect: "manual",
      ...(hasBody ? { body: await request.arrayBuffer() } : {}),
    });
  } catch {
    return htmlError(target.toString(), "Le site n'a pas répondu.");
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!DROP_RESPONSE.has(key.toLowerCase())) out.set(key, value);
  });
  out.set("Cache-Control", "no-store");

  const setCookies = collectSetCookies(upstream);
  for (const raw of setCookies) {
    const local = localSetCookie(raw, sid);
    if (local) out.append("Set-Cookie", local);
  }

  // Redirections : on reste dans la fenêtre.
  const location = upstream.headers.get("location");
  if (upstream.status >= 300 && upstream.status < 400 && location) {
    try {
      out.set("Location", proxiedPath(sid, new URL(location, target)));
    } catch {
      out.delete("Location");
    }
    return new Response(null, { status: upstream.status, headers: out });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    const body = await upstream.text();
    out.set("Content-Type", "text/html; charset=utf-8");
    return new Response(rewriteHtml(body, target, sid), { status: 200, headers: out });
  }
  if (contentType.includes("text/css")) {
    const body = await upstream.text();
    out.set("Content-Type", "text/css; charset=utf-8");
    return new Response(rewriteCss(body, target, sid), { status: upstream.status, headers: out });
  }

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

function collectSetCookies(response: Response): string[] {
  const anyHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") return anyHeaders.getSetCookie();
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

function htmlError(url: string, reason: string): Response {
  const body = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0b0c;color:#f5f5f5;font-family:system-ui,sans-serif;text-align:center;padding:32px}
  .card{max-width:420px}h1{font-size:22px;margin:0 0 10px}p{opacity:.7;font-size:15px;line-height:1.5}
  </style></head><body><div class="card"><h1>Fenêtre bloquée</h1><p>${reason}</p><p>${url}</p></div></body></html>`;
  return new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export const Route = createFileRoute("/api/public/px/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      HEAD: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
      PUT: ({ request }) => handle(request),
      PATCH: ({ request }) => handle(request),
      DELETE: ({ request }) => handle(request),
      OPTIONS: ({ request }) => handle(request),
    },
  },
});
