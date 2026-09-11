import { createFileRoute } from "@tanstack/react-router";

/**
 * Fenêtre interne : récupère une page distante côté serveur et retire les en-têtes
 * qui empêchent l'affichage dans une fenêtre intégrée. Chaque fenêtre du site
 * reste isolée (bac à sable sans origine partagée, aucun cookie relayé).
 */

const STRIPPED = new Set([
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
  "permissions-policy",
]);

const INLINE_SCRIPT = `
(function () {
  var P = '/api/public/proxy?url=';
  function abs(href) { try { return new URL(href, document.baseURI).href; } catch (e) { return null; } }
  function go(u) { if (u && u.indexOf('http') === 0) window.location.href = P + encodeURIComponent(u); }
  document.addEventListener('click', function (event) {
    var el = event.target;
    var anchor = el && el.closest ? el.closest('a[href]') : null;
    if (!anchor) return;
    var raw = anchor.getAttribute('href') || '';
    if (raw.indexOf('#') === 0 || raw.indexOf('javascript:') === 0 || raw.indexOf('mailto:') === 0) return;
    var u = abs(raw);
    if (!u) return;
    event.preventDefault();
    go(u);
  }, true);
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || (form.method && form.method.toLowerCase() !== 'get')) return;
    var u = abs(form.getAttribute('action') || window.location.href);
    if (!u) return;
    event.preventDefault();
    var params = new URLSearchParams();
    new FormData(form).forEach(function (value, key) { params.append(key, String(value)); });
    go(u.split('?')[0] + '?' + params.toString());
  }, true);
})();
`;

function rewriteHtml(html: string, target: string): string {
  let output = html
    .replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, "")
    .replace(/<base[^>]*>/gi, "");
  const injection = `<base href="${target}"><script>${INLINE_SCRIPT}</script>`;
  if (/<head[^>]*>/i.test(output)) {
    output = output.replace(/<head[^>]*>/i, (match) => `${match}${injection}`);
  } else {
    output = injection + output;
  }
  return output;
}

async function handle(request: Request): Promise<Response> {
  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) return new Response("Paramètre url manquant", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("Adresse invalide", { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return new Response("Protocole non autorisé", { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          request.headers.get("user-agent") ??
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        Accept: request.headers.get("accept") ?? "text/html,*/*",
        "Accept-Language": request.headers.get("accept-language") ?? "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });
  } catch {
    return new Response(errorPage(target.toString(), "Le site n'a pas répondu."), {
      status: 502,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIPPED.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set("Cache-Control", "no-store");

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    const body = await upstream.text();
    headers.set("Content-Type", "text/html; charset=utf-8");
    if (!upstream.ok && body.length < 400) {
      return new Response(errorPage(target.toString(), `Le site a répondu ${upstream.status}.`), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return new Response(rewriteHtml(body, target.toString()), { status: 200, headers });
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}

function errorPage(url: string, reason: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#161a24;color:#f2f5ff;font-family:system-ui,sans-serif;text-align:center;padding:32px}
  .card{max-width:420px}h1{font-size:22px;margin:0 0 10px}p{opacity:.7;font-size:15px;line-height:1.5}
  </style></head><body><div class="card"><h1>Fenêtre bloquée</h1><p>${reason}</p><p>${url}</p></div></body></html>`;
}

export const Route = createFileRoute("/api/public/proxy")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      HEAD: ({ request }) => handle(request),
    },
  },
});
