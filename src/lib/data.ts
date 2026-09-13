import { supabase } from "@/integrations/supabase/client";

export interface Person {
  id: string;
  name: string;
  is_admin: boolean;
  created_at: string;
}

export interface FacePhoto {
  id: string;
  person_id: string;
  file_name: string;
  image_url: string;
  descriptor: number[] | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  person_id: string;
  kind: "income" | "expense";
  label: string;
  amount: number;
  category: string;
  occurred_on: string;
  created_at: string;
}

export interface Message {
  id: string;
  person_id: string;
  content: string;
  created_at: string;
}

export interface BrowserTab {
  id: string;
  label: string;
  url: string;
  icon_url: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  person_id: string | null;
  title: string;
  image_url: string;
  url: string;
  created_at: string;
}

const signedCache = new Map<string, { url: string; expires: number }>();

/** Les espaces de stockage sont privés : on génère des liens signés temporaires. */
export async function signedUrl(bucket: string, path: string): Promise<string> {
  const key = `${bucket}/${path}`;
  const cached = signedCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error || !data) throw error ?? new Error("Lien indisponible");
  signedCache.set(key, { url: data.signedUrl, expires: Date.now() + 45 * 60 * 1000 });
  return data.signedUrl;
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function euros(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function faviconFor(url: string, size = 128): string {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=${size}`;
  } catch {
    return `https://www.google.com/s2/favicons?domain=example.com&sz=${size}`;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Fenêtre interne : chaque fenêtre a son propre identifiant, ce qui isole
 * complètement ses cookies (donc ses connexions) des autres fenêtres.
 */
export function proxyUrl(url: string, sessionId = "default"): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const scheme = parsed.protocol === "http:" ? "http" : "https";
    const sid = sessionId.replace(/[^a-zA-Z0-9_-]/g, "") || "default";
    return `/api/public/px/${sid}/${scheme}/${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return `/api/public/px/default/https/${url}`;
  }
}

/** Extrait la première URL trouvée dans un message. */
export function firstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

export function isVintedUrl(url: string): boolean {
  return /(^|\.)vinted\./i.test(hostOf(url)) || /vinted/i.test(url);
}

export function prettyTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop() ?? parsed.hostname;
    return decodeURIComponent(last)
      .replace(/\.[a-z0-9]{2,4}$/i, "")
      .replace(/^\d+-/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\w/, (c) => c.toUpperCase());
  } catch {
    return url;
  }
}

export async function fetchPeople(): Promise<Person[]> {
  const { data, error } = await supabase.from("people").select("*").order("created_at");
  if (error) throw error;
  return (data ?? []) as Person[];
}

export async function fetchFacePhotos(): Promise<FacePhoto[]> {
  const { data, error } = await supabase.from("face_photos").select("*");
  if (error) throw error;
  return (data ?? []) as unknown as FacePhoto[];
}
