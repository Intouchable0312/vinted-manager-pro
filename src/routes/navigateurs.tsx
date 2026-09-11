import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  Globe2,
  Maximize2,
  Plus,
  RotateCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { faviconFor, hostOf, proxyUrl, type BrowserTab } from "@/lib/data";

export const Route = createFileRoute("/navigateurs")({
  validateSearch: (search: Record<string, unknown>) => ({
    url: typeof search['url'] === "string" ? (search['url'] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Fenêtres — La Bectavance 💸" },
      {
        name: "description",
        content: "Fenêtres de navigation isolées, ouvertes directement dans le site.",
      },
      { property: "og:title", content: "Fenêtres — La Bectavance 💸" },
      {
        property: "og:description",
        content: "Crée des fenêtres de navigation totalement isolées, sans quitter le site.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <BrowsersPage />
    </AppShell>
  ),
  ssr: false,
});

interface OpenWindow {
  key: string;
  label: string;
  url: string;
}

function BrowsersPage() {
  const queryClient = useQueryClient();
  const { person } = useSession();
  const personId = person?.id ?? null;
  const { url: incoming } = Route.useSearch();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState<OpenWindow | null>(null);

  const { data: browsers = [] } = useQuery({
    queryKey: ["browsers", personId],
    enabled: Boolean(personId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("browsers")
        .select("*")
        .eq("person_id", personId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as BrowserTab[];
    },
  });

  useEffect(() => {
    if (incoming) {
      setOpen({ key: `direct-${incoming}`, label: hostOf(incoming), url: incoming });
    }
  }, [incoming]);

  const create = useMutation({
    mutationFn: async () => {
      const raw = url.trim();
      if (!raw) throw new Error("Indique une adresse.");
      if (!personId) throw new Error("Session introuvable.");
      const normalized = raw.startsWith("http") ? raw : `https://${raw}`;
      const parsed = new URL(normalized);
      const { error } = await supabase.from("browsers").insert({
        person_id: personId,
        label: label.trim() || hostOf(normalized),
        url: parsed.toString(),
        icon_url: faviconFor(normalized, 256),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setLabel("");
      setUrl("");
      toast.success("Fenêtre créée");
      queryClient.invalidateQueries({ queryKey: ["browsers"] });
    },
    onError: () => toast.error("Adresse invalide"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("browsers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["browsers"] }),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl sm:text-5xl">Fenêtres</h1>
        <p className="text-muted-foreground mt-2 text-base font-medium">
          Chaque fenêtre est étanche : aucune ne partage ses données avec une autre.
        </p>
      </div>

      <div className="glass rounded-3xl p-6">
        <h2 className="text-2xl">Nouvelle fenêtre</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1.3fr_auto]">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Nom (optionnel)"
            className="bg-input/60 focus:ring-ring rounded-2xl px-5 py-4 text-base font-medium outline-none focus:ring-2"
          />
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="vinted.fr"
            className="bg-input/60 focus:ring-ring rounded-2xl px-5 py-4 text-base font-medium outline-none focus:ring-2"
          />
          <button
            onClick={() => create.mutate()}
            className="bg-primary text-primary-foreground flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-bold transition-transform hover:scale-[1.02]"
          >
            <Plus className="h-5 w-5" />
            Créer
          </button>
        </div>
        <p className="text-muted-foreground mt-3 flex items-center gap-2 text-xs font-bold">
          <ShieldCheck className="text-success h-4 w-4" />
          Isolation totale : bac à sable dédié, aucun cookie transmis entre les fenêtres.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {browsers.map((browser, index) => (
          <motion.div
            key={browser.id}
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: Math.min(index * 0.04, 0.4) }}
            className="glass hover-lift group relative rounded-3xl p-5 hover:scale-[1.03]"
          >
            <button
              onClick={() =>
                setOpen({ key: browser.id, label: browser.label, url: browser.url })
              }
              className="flex w-full flex-col items-center gap-3 text-center"
            >
              <img
                src={browser.icon_url ?? faviconFor(browser.url, 256)}
                alt=""
                className="bg-background h-16 w-16 rounded-3xl object-contain p-2.5"
              />
              <span className="truncate text-base font-bold">{browser.label}</span>
              <span className="text-muted-foreground truncate text-xs font-bold">
                {hostOf(browser.url)}
              </span>
            </button>
            <button
              onClick={() => remove.mutate(browser.id)}
              className="text-muted-foreground hover:text-destructive absolute top-3 right-3 p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Supprimer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </motion.div>
        ))}

        {browsers.length === 0 ? (
          <div className="glass text-muted-foreground col-span-full rounded-3xl p-10 text-center text-sm font-bold">
            Crée ta première fenêtre (Vinted, YouTube, Vinted Pro…).
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {open ? <BrowserWindow window={open} onClose={() => setOpen(null)} /> : null}
      </AnimatePresence>
    </div>
  );
}

function BrowserWindow({ window: target, onClose }: { window: OpenWindow; onClose: () => void }) {
  const [mode, setMode] = useState<"internal" | "direct">("internal");
  const [nonce, setNonce] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const src = useMemo(
    () => (mode === "internal" ? proxyUrl(target.url) : target.url),
    [mode, target.url],
  );

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 backdrop-blur-sm sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className={`glass flex w-full flex-col overflow-hidden rounded-3xl ${
          expanded ? "h-full max-w-none" : "h-[88vh] max-w-5xl"
        }`}
        initial={{ scale: 0.95, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
      >
        <div className="border-border flex items-center gap-2 border-b px-4 py-3">
          <div className="bg-primary/15 text-primary rounded-xl p-2">
            <Globe2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{target.label}</p>
            <p className="text-muted-foreground truncate text-xs font-medium">
              {hostOf(target.url)} · {mode === "internal" ? "mode interne" : "mode direct"}
            </p>
          </div>
          <button
            onClick={() => setMode(mode === "internal" ? "direct" : "internal")}
            className="text-muted-foreground hover:text-foreground rounded-xl p-2 transition-colors"
            aria-label="Changer de mode"
            title="Basculer interne / direct"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => setNonce((value) => value + 1)}
            className="text-muted-foreground hover:text-foreground rounded-xl p-2 transition-colors"
            aria-label="Recharger"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setExpanded((value) => !value)}
            className="text-muted-foreground hover:text-foreground rounded-xl p-2 transition-colors"
            aria-label="Agrandir"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-destructive rounded-xl p-2 transition-colors"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <iframe
          key={`${target.key}-${mode}-${nonce}`}
          src={src}
          title={target.label}
          className="bg-background h-full w-full flex-1"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
        />
      </motion.div>
    </motion.div>
  );
}
