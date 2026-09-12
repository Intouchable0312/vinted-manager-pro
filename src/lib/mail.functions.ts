import { createServerFn } from "@tanstack/react-start";

/**
 * Boîtes e-mail jetables : on s'appuie sur les API publiques et gratuites
 * mail.tm / mail.gw (même contrat REST). Tout passe par le serveur pour
 * éviter les blocages CORS et garder les identifiants hors du navigateur.
 */

const PROVIDERS = ["https://api.mail.tm", "https://api.mail.gw"] as const;

export interface MailDomain {
  domain: string;
}

export interface MailSummary {
  id: string;
  from: string;
  subject: string;
  intro: string;
  seen: boolean;
  createdAt: string;
}

export interface MailDetail extends MailSummary {
  html: string;
  text: string;
  to: string;
}

async function request(base: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function tokenFor(address: string, password: string): Promise<{ base: string; token: string }> {
  let lastError = "Connexion impossible";
  for (const base of PROVIDERS) {
    const response = await request(base, "/token", {
      method: "POST",
      body: JSON.stringify({ address, password }),
    });
    if (response.ok) {
      const data = (await response.json()) as { token?: string };
      if (data.token) return { base, token: data.token };
    } else {
      lastError = `${response.status} ${await response.text()}`;
    }
  }
  throw new Error(`Boîte inaccessible: ${lastError}`);
}

function normalizeSummary(row: Record<string, unknown>): MailSummary {
  const from = row["from"] as { address?: string; name?: string } | undefined;
  return {
    id: String(row["id"] ?? ""),
    from: from?.address ? (from.name ? `${from.name} <${from.address}>` : from.address) : "inconnu",
    subject: String(row["subject"] ?? "(sans objet)"),
    intro: String(row["intro"] ?? ""),
    seen: Boolean(row["seen"]),
    createdAt: String(row["createdAt"] ?? new Date().toISOString()),
  };
}

export const listMailDomains = createServerFn({ method: "GET" }).handler(async () => {
  for (const base of PROVIDERS) {
    const response = await request(base, "/domains?page=1");
    if (!response.ok) continue;
    const body = (await response.json()) as { "hydra:member"?: Array<{ domain: string }> } | Array<{ domain: string }>;
    const rows = Array.isArray(body) ? body : (body["hydra:member"] ?? []);
    const domains = rows.map((row) => ({ domain: row.domain })).filter((row) => row.domain);
    if (domains.length > 0) return { domains } satisfies { domains: MailDomain[] };
  }
  return { domains: [] as MailDomain[] };
});

export const createMailbox = createServerFn({ method: "POST" })
  .inputValidator((input: { localPart: string; domain: string }) => input)
  .handler(async ({ data }) => {
    const local = data.localPart
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 24);
    if (!local) throw new Error("Nom d'adresse invalide");
    const address = `${local}@${data.domain}`;
    const password = `Bk${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}!`;

    let lastError = "Création impossible";
    for (const base of PROVIDERS) {
      const response = await request(base, "/accounts", {
        method: "POST",
        body: JSON.stringify({ address, password }),
      });
      if (response.ok) return { address, password };
      lastError = `${response.status} ${await response.text()}`;
      if (response.status === 422) break;
    }
    throw new Error(`Création impossible: ${lastError}`);
  });

export const listMailMessages = createServerFn({ method: "POST" })
  .inputValidator((input: { address: string; password: string }) => input)
  .handler(async ({ data }) => {
    const { base, token } = await tokenFor(data.address, data.password);
    const response = await request(base, "/messages?page=1", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Lecture impossible: ${response.status}`);
    const body = (await response.json()) as
      | { "hydra:member"?: Array<Record<string, unknown>> }
      | Array<Record<string, unknown>>;
    const rows = Array.isArray(body) ? body : (body["hydra:member"] ?? []);
    return { messages: rows.map(normalizeSummary) satisfies MailSummary[] };
  });

export const readMailMessage = createServerFn({ method: "POST" })
  .inputValidator((input: { address: string; password: string; id: string }) => input)
  .handler(async ({ data }) => {
    const { base, token } = await tokenFor(data.address, data.password);
    const response = await request(base, `/messages/${data.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Message illisible: ${response.status}`);
    const row = (await response.json()) as Record<string, unknown>;
    await request(base, `/messages/${data.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/merge-patch+json" },
      body: JSON.stringify({ seen: true }),
    }).catch(() => undefined);
    const to = (row["to"] as Array<{ address?: string }> | undefined)?.[0]?.address ?? data.address;
    const html = Array.isArray(row["html"]) ? (row["html"] as string[]).join("\n") : "";
    return {
      message: {
        ...normalizeSummary(row),
        to,
        html,
        text: String(row["text"] ?? ""),
      } satisfies MailDetail,
    };
  });

export const deleteMailbox = createServerFn({ method: "POST" })
  .inputValidator((input: { address: string; password: string }) => input)
  .handler(async ({ data }) => {
    try {
      const { base, token } = await tokenFor(data.address, data.password);
      const me = await request(base, "/me", { headers: { Authorization: `Bearer ${token}` } });
      if (me.ok) {
        const account = (await me.json()) as { id?: string };
        if (account.id) {
          await request(base, `/accounts/${account.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      }
    } catch {
      /* la boîte a peut-être déjà expiré côté fournisseur */
    }
    return { ok: true };
  });
