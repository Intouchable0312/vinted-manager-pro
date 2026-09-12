import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Inbox, Mail, Plus, RefreshCw, Trash2, X } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import {
  createMailbox,
  deleteMailbox,
  listMailDomains,
  listMailMessages,
  readMailMessage,
} from "@/lib/mail.functions";

interface Mailbox {
  id: string;
  person_id: string | null;
  label: string | null;
  address: string;
  password: string;
  created_at: string;
}

export const Route = createFileRoute("/emails")({
  head: () => ({
    meta: [
      { title: "E-mails — La Bectavance 💸" },
      {
        name: "description",
        content:
          "Crée autant d'adresses e-mail que nécessaire et lis les messages reçus directement depuis le site.",
      },
      { property: "og:title", content: "E-mails — La Bectavance 💸" },
      {
        property: "og:description",
        content: "Adresses e-mail privées et boîte de réception intégrée au site.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <EmailsPage />
    </AppShell>
  ),
  ssr: false,
});

function EmailsPage() {
  const { person } = useSession();
  const personId = person?.id ?? null;
  const queryClient = useQueryClient();

  const domainsFn = useServerFn(listMailDomains);
  const createFn = useServerFn(createMailbox);
  const messagesFn = useServerFn(listMailMessages);
  const readFn = useServerFn(readMailMessage);
  const dropFn = useServerFn(deleteMailbox);

  const [localPart, setLocalPart] = useState("");
  const [domain, setDomain] = useState("");
  const [selected, setSelected] = useState<Mailbox | null>(null);
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);

  const { data: domains = [] } = useQuery({
    queryKey: ["mail-domains"],
    queryFn: async () => {
      const result = await domainsFn();
      if (result.domains[0] && !domain) setDomain(result.domains[0].domain);
      return result.domains;
    },
    staleTime: 30 * 60 * 1000,
  });

  const { data: mailboxes = [], isLoading } = useQuery({
    queryKey: ["mailboxes", personId],
    enabled: Boolean(personId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mailboxes")
        .select("*")
        .eq("person_id", personId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as Mailbox[];
      if (rows[0]) setSelected((current) => current ?? rows[0]!);
      return rows;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const chosen = domain || domains[0]?.domain;
      if (!chosen) throw new Error("Aucun domaine disponible pour le moment");
      const base = localPart.trim() || `bec${Math.random().toString(36).slice(2, 8)}`;
      const credentials = await createFn({ data: { localPart: base, domain: chosen } });
      const { data, error } = await supabase
        .from("mailboxes")
        .insert({
          person_id: personId,
          address: credentials.address,
          password: credentials.password,
          label: localPart.trim() || null,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Mailbox;
    },
    onSuccess: (row) => {
      setLocalPart("");
      setSelected(row);
      toast.success(`${row.address} est prête`);
      queryClient.invalidateQueries({ queryKey: ["mailboxes", personId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Création impossible"),
  });

  const remove = useMutation({
    mutationFn: async (box: Mailbox) => {
      await dropFn({ data: { address: box.address, password: box.password } });
      const { error } = await supabase.from("mailboxes").delete().eq("id", box.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelected(null);
      toast.success("Adresse supprimée");
      queryClient.invalidateQueries({ queryKey: ["mailboxes", personId] });
    },
    onError: () => toast.error("Suppression impossible"),
  });

  const inbox = useQuery({
    queryKey: ["mail-inbox", selected?.address],
    enabled: Boolean(selected),
    refetchInterval: 15000,
    queryFn: async () => {
      const result = await messagesFn({
        data: { address: selected!.address, password: selected!.password },
      });
      return result.messages;
    },
  });

  const detail = useQuery({
    queryKey: ["mail-message", selected?.address, openMessageId],
    enabled: Boolean(selected && openMessageId),
    queryFn: async () => {
      const result = await readFn({
        data: { address: selected!.address, password: selected!.password, id: openMessageId! },
      });
      return result.message;
    },
  });

  return (
    <div className="space-y-8">
      <motion.header
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-2"
      >
        <p className="text-muted-foreground text-sm uppercase tracking-[0.3em]">Boîtes privées</p>
        <h1 className="text-4xl md:text-5xl">E-mails</h1>
      </motion.header>

      <motion.section
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        className="glass rounded-3xl p-5 md:p-7"
      >
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-center">
          <input
            value={localPart}
            onChange={(event) => setLocalPart(event.target.value)}
            placeholder="nom de l'adresse (optionnel)"
            className="border-input bg-surface-2/60 focus:border-ring h-14 rounded-2xl border px-5 text-base outline-none transition"
          />
          <select
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            className="border-input bg-surface-2/60 focus:border-ring h-14 rounded-2xl border px-5 text-base outline-none transition"
          >
            {domains.length === 0 ? <option value="">Chargement…</option> : null}
            {domains.map((item) => (
              <option key={item.domain} value={item.domain}>
                @{item.domain}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={create.isPending}
            onClick={() => create.mutate()}
            className="hover-lift bg-primary text-primary-foreground flex h-14 items-center justify-center gap-2 rounded-2xl px-6 font-semibold hover:scale-[1.03] disabled:opacity-60"
          >
            <Plus className="size-5" />
            {create.isPending ? "Création…" : "Nouvelle adresse"}
          </button>
        </div>
      </motion.section>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <section className="space-y-3">
          {isLoading ? (
            <div className="bg-surface-2/60 h-24 animate-pulse rounded-3xl" />
          ) : mailboxes.length === 0 ? (
            <p className="glass text-muted-foreground rounded-3xl p-8 text-center text-sm">
              Aucune adresse pour l'instant.
            </p>
          ) : (
            <AnimatePresence mode="popLayout">
              {mailboxes.map((box) => (
                <motion.div
                  key={box.id}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className={`glass group flex items-center gap-3 rounded-3xl p-4 transition ${
                    selected?.id === box.id ? "border-primary/60 border" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(box);
                      setOpenMessageId(null);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="bg-surface-2 rounded-2xl p-3">
                      <Mail className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{box.address}</span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(box.created_at).toLocaleDateString("fr-FR")}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(box.address);
                      toast.success("Adresse copiée");
                    }}
                    className="text-muted-foreground hover:text-foreground p-2"
                    aria-label={`Copier ${box.address}`}
                  >
                    <Copy className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove.mutate(box)}
                    className="text-muted-foreground hover:text-destructive p-2"
                    aria-label={`Supprimer ${box.address}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </section>

        <section className="glass min-h-[420px] rounded-3xl p-5 md:p-7">
          {!selected ? (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 py-16">
              <Inbox className="size-8" />
              <p className="text-sm">Choisis une adresse pour voir ses messages.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-[0.25em]">
                    Réception
                  </p>
                  <h2 className="text-2xl">{selected.address}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => inbox.refetch()}
                  className="border-border bg-surface-2/60 hover:bg-surface-2 flex h-11 items-center gap-2 rounded-2xl border px-5 text-sm font-semibold transition"
                >
                  <RefreshCw className={`size-4 ${inbox.isFetching ? "animate-spin" : ""}`} />
                  Actualiser
                </button>
              </div>

              {inbox.isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="bg-surface-2/60 h-20 animate-pulse rounded-2xl" />
                  ))}
                </div>
              ) : inbox.isError ? (
                <p className="text-destructive text-sm">
                  Impossible de lire cette boîte pour le moment.
                </p>
              ) : (inbox.data ?? []).length === 0 ? (
                <p className="text-muted-foreground py-12 text-center text-sm">
                  Aucun message. La boîte se met à jour automatiquement.
                </p>
              ) : (
                <div className="space-y-3">
                  {(inbox.data ?? []).map((message, index) => (
                    <motion.button
                      key={message.id}
                      type="button"
                      onClick={() => setOpenMessageId(message.id)}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: index * 0.03 }}
                      className="border-border bg-surface-2/50 hover:bg-surface-2 w-full rounded-2xl border p-4 text-left transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold">{message.from}</span>
                        <span className="text-muted-foreground text-xs">
                          {new Date(message.createdAt).toLocaleString("fr-FR")}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-base">{message.subject}</p>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                        {message.intro}
                      </p>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <AnimatePresence>
        {openMessageId ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpenMessageId(null)}
          >
            <motion.div
              className="glass flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl"
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-border flex items-start justify-between gap-4 border-b p-5">
                <div className="min-w-0">
                  <h3 className="truncate text-xl">{detail.data?.subject ?? "Message"}</h3>
                  <p className="text-muted-foreground truncate text-xs">
                    {detail.data?.from ?? ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenMessageId(null)}
                  className="text-muted-foreground hover:text-foreground p-1"
                  aria-label="Fermer"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto bg-white">
                {detail.isLoading ? (
                  <div className="bg-surface-2/60 h-64 animate-pulse" />
                ) : detail.data?.html ? (
                  <iframe
                    title="Message"
                    sandbox=""
                    srcDoc={detail.data.html}
                    className="h-[60vh] w-full border-0"
                  />
                ) : (
                  <pre className="text-foreground bg-background max-h-[60vh] whitespace-pre-wrap p-5 text-sm">
                    {detail.data?.text ?? "Message vide"}
                  </pre>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
