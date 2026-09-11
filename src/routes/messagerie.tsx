import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, PackagePlus, Send, Tag } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  faviconFor,
  firstUrl,
  hostOf,
  isVintedUrl,
  prettyTitleFromUrl,
  type Message,
  type Person,
} from "@/lib/data";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/messagerie")({
  head: () => ({
    meta: [
      { title: "Messagerie — La Bectavance 💸" },
      {
        name: "description",
        content: "Discussion partagée de l'équipe, avec aperçus enrichis des annonces Vinted.",
      },
      { property: "og:title", content: "Messagerie — La Bectavance 💸" },
      {
        property: "og:description",
        content: "Messagerie interne partagée avec aperçus d'annonces et actions rapides.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <ChatPage />
    </AppShell>
  ),
  ssr: false,
});

function ChatPage() {
  const { person } = useSession();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: people = [] } = useQuery({
    queryKey: ["people"],
    queryFn: async () => {
      const { data, error } = await supabase.from("people").select("*");
      if (error) throw error;
      return (data ?? []) as Person[];
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("messagerie")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["messages"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: async () => {
      const content = draft.trim();
      if (!content || !person) return;
      const { error } = await supabase
        .from("messages")
        .insert({ person_id: person.id, content });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: () => toast.error("Message non envoyé"),
  });

  const names = new Map(people.map((entry) => [entry.id, entry.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl sm:text-5xl">Messagerie</h1>
        <p className="text-muted-foreground mt-2 text-base font-medium">
          Partagée entre tout le monde. Colle un lien Vinted pour un aperçu instantané.
        </p>
      </div>

      <div className="glass flex h-[62vh] flex-col rounded-3xl p-4 sm:p-6">
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm font-bold">
              Aucun message. Lance la discussion.
            </p>
          ) : (
            messages.map((message) => {
              const mine = message.person_id === person?.id;
              const url = firstUrl(message.content);
              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div className="max-w-[86%] space-y-2">
                    <p
                      className={`text-muted-foreground px-2 text-xs font-bold ${
                        mine ? "text-right" : ""
                      }`}
                    >
                      {names.get(message.person_id) ?? "Inconnu"} ·{" "}
                      {new Date(message.created_at).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <div
                      className={`rounded-3xl px-5 py-3.5 text-base font-medium break-words ${
                        mine
                          ? "bg-primary text-primary-foreground rounded-br-lg"
                          : "bg-surface-2 rounded-bl-lg"
                      }`}
                    >
                      {message.content}
                    </div>
                    {url ? <LinkEmbed url={url} /> : null}
                  </div>
                </motion.div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send.mutate();
              }
            }}
            placeholder="Écris un message ou colle un lien…"
            className="bg-input/60 focus:ring-ring flex-1 rounded-2xl px-5 py-4 text-base font-medium outline-none focus:ring-2"
          />
          <button
            onClick={() => send.mutate()}
            disabled={send.isPending || !draft.trim()}
            className="bg-primary text-primary-foreground rounded-2xl p-4 transition-transform hover:scale-105 disabled:opacity-50"
            aria-label="Envoyer"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function LinkEmbed({ url }: { url: string }) {
  const { person } = useSession();
  const queryClient = useQueryClient();
  const vinted = isVintedUrl(url);
  const title = prettyTitleFromUrl(url);

  const addProduct = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("products").insert({
        person_id: person?.id ?? null,
        title,
        image_url: faviconFor(url, 256),
        url,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ajouté aux produits");
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: () => toast.error("Ajout impossible"),
  });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-surface-2/80 overflow-hidden rounded-3xl border p-4 ${
        vinted ? "border-primary/50" : "border-border"
      }`}
    >
      <div className="flex items-center gap-3">
        <img
          src={faviconFor(url, 128)}
          alt=""
          className="bg-background h-11 w-11 rounded-2xl object-contain p-1.5"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold">{title}</p>
          <p className="text-muted-foreground truncate text-xs font-bold">
            {vinted ? "Annonce Vinted" : hostOf(url)}
          </p>
        </div>
        {vinted ? (
          <span className="bg-primary/15 text-primary flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold">
            <Tag className="h-3.5 w-3.5" />
            Vinted
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/navigateurs"
          search={{ url }}
          className="bg-primary text-primary-foreground flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold transition-transform hover:scale-105"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Ouvrir dans une fenêtre
        </Link>
        <button
          onClick={() => addProduct.mutate()}
          className="border-border flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-bold transition-colors hover:bg-white/5"
        >
          <PackagePlus className="h-3.5 w-3.5" />
          Ajouter aux produits
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(url);
            toast.success("Lien copié");
          }}
          className="border-border flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-bold transition-colors hover:bg-white/5"
        >
          <Copy className="h-3.5 w-3.5" />
          Copier
        </button>
      </div>
    </motion.div>
  );
}
