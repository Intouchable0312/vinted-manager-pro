import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDownRight, ArrowUpRight, Plus, Trash2, Wallet } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { euros, type Transaction } from "@/lib/data";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/accueil")({
  head: () => ({
    meta: [
      { title: "Accueil — La Bectavance 💸" },
      {
        name: "description",
        content: "Chiffre d'affaires, dépenses et solde de ton compte Vinted, en direct.",
      },
      { property: "og:title", content: "Accueil — La Bectavance 💸" },
      {
        property: "og:description",
        content: "Suivi privé des rentrées d'argent et des dépenses de ton compte Vinted.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <HomePage />
    </AppShell>
  ),
  ssr: false,
});

function HomePage() {
  const { person } = useSession();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<"income" | "expense">("income");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");

  const personId = person?.id ?? "";

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions", personId],
    enabled: Boolean(personId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("person_id", personId)
        .order("occurred_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Transaction[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const value = Number(amount.replace(",", "."));
      if (!label.trim() || !Number.isFinite(value) || value <= 0) {
        throw new Error("Renseigne un libellé et un montant valide.");
      }
      const { error } = await supabase.from("transactions").insert({
        person_id: personId,
        kind,
        label: label.trim(),
        amount: value,
        category: category.trim() || (kind === "income" ? "Vente" : "Achat"),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setLabel("");
      setAmount("");
      setCategory("");
      toast.success(kind === "income" ? "Rentrée ajoutée" : "Dépense ajoutée");
      queryClient.invalidateQueries({ queryKey: ["transactions", personId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ligne supprimée");
      queryClient.invalidateQueries({ queryKey: ["transactions", personId] });
    },
  });

  const stats = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const item of transactions) {
      const value = Number(item.amount);
      if (item.kind === "income") income += value;
      else expense += value;
    }
    const margin = income > 0 ? ((income - expense) / income) * 100 : 0;
    return { income, expense, balance: income - expense, margin };
  }, [transactions]);

  const chart = useMemo(() => {
    const buckets = new Map<string, { mois: string; Rentrées: number; Dépenses: number }>();
    for (const item of [...transactions].reverse()) {
      const key = item.occurred_on.slice(0, 7);
      const existing = buckets.get(key) ?? { mois: key, Rentrées: 0, Dépenses: 0 };
      if (item.kind === "income") existing.Rentrées += Number(item.amount);
      else existing.Dépenses += Number(item.amount);
      buckets.set(key, existing);
    }
    return Array.from(buckets.values());
  }, [transactions]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl sm:text-5xl">
          Salut <span className="text-money">{person?.name}</span>
        </h1>
        <p className="text-muted-foreground mt-2 text-base font-medium">
          Tes chiffres, visibles seulement par toi.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Chiffre d'affaires"
          value={euros(stats.income)}
          tone="primary"
          icon={<ArrowUpRight className="h-5 w-5" />}
          delay={0}
        />
        <StatCard
          label="Dépenses"
          value={euros(stats.expense)}
          tone="destructive"
          icon={<ArrowDownRight className="h-5 w-5" />}
          delay={0.06}
        />
        <StatCard
          label="Solde"
          value={euros(stats.balance)}
          tone="success"
          icon={<Wallet className="h-5 w-5" />}
          delay={0.12}
        />
        <StatCard
          label="Marge"
          value={`${stats.margin.toFixed(1)} %`}
          tone="accent"
          icon={<ArrowUpRight className="h-5 w-5" />}
          delay={0.18}
        />
      </div>

      <div className="glass rounded-3xl p-6">
        <h2 className="text-2xl">Évolution</h2>
        <div className="mt-6 h-64">
          {chart.length === 0 ? (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm font-bold">
              Ajoute une ligne pour voir la courbe.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart}>
                <defs>
                  <linearGradient id="in" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.65} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="out" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="mois" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 16,
                    color: "var(--foreground)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="Rentrées"
                  stroke="var(--primary)"
                  strokeWidth={3}
                  fill="url(#in)"
                />
                <Area
                  type="monotone"
                  dataKey="Dépenses"
                  stroke="var(--destructive)"
                  strokeWidth={3}
                  fill="url(#out)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="glass rounded-3xl p-6">
        <h2 className="text-2xl">Nouvelle ligne</h2>
        <div className="mt-5 flex gap-2">
          {(["income", "expense"] as const).map((option) => (
            <button
              key={option}
              onClick={() => setKind(option)}
              className={`flex-1 rounded-2xl px-4 py-3 text-sm font-bold transition-all ${
                kind === option
                  ? option === "income"
                    ? "bg-primary text-primary-foreground"
                    : "bg-destructive text-destructive-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {option === "income" ? "Rentrée d'argent" : "Dépense"}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Libellé"
            className="bg-input/60 focus:ring-ring rounded-2xl px-5 py-4 text-base font-medium outline-none focus:ring-2"
          />
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="Montant €"
            className="bg-input/60 focus:ring-ring rounded-2xl px-5 py-4 text-base font-medium outline-none focus:ring-2"
          />
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Catégorie"
            className="bg-input/60 focus:ring-ring rounded-2xl px-5 py-4 text-base font-medium outline-none focus:ring-2"
          />
        </div>

        <button
          onClick={() => add.mutate()}
          disabled={add.isPending}
          className="bg-primary text-primary-foreground mt-4 flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-bold transition-transform hover:scale-[1.01] disabled:opacity-60"
        >
          <Plus className="h-5 w-5" />
          Ajouter
        </button>
      </div>

      <div className="glass rounded-3xl p-6">
        <h2 className="text-2xl">Historique</h2>
        <div className="mt-5 space-y-3">
          {isLoading ? (
            <p className="text-muted-foreground text-sm font-bold">Chargement…</p>
          ) : transactions.length === 0 ? (
            <p className="text-muted-foreground text-sm font-bold">Encore rien ici.</p>
          ) : (
            transactions.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.3) }}
                className="bg-surface-2/60 hover-lift flex items-center gap-4 rounded-2xl px-5 py-4 hover:scale-[1.01]"
              >
                <div
                  className={`rounded-xl p-2.5 ${
                    item.kind === "income"
                      ? "bg-primary/15 text-primary"
                      : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {item.kind === "income" ? (
                    <ArrowUpRight className="h-5 w-5" />
                  ) : (
                    <ArrowDownRight className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold">{item.label}</p>
                  <p className="text-muted-foreground text-xs font-medium">
                    {item.category} · {item.occurred_on}
                  </p>
                </div>
                <p
                  className={`text-lg font-bold ${
                    item.kind === "income" ? "text-primary" : "text-destructive"
                  }`}
                >
                  {item.kind === "income" ? "+" : "−"}
                  {euros(Number(item.amount))}
                </p>
                <button
                  onClick={() => remove.mutate(item.id)}
                  className="text-muted-foreground hover:text-destructive p-2 transition-colors"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon,
  delay,
}: {
  label: string;
  value: string;
  tone: "primary" | "destructive" | "success" | "accent";
  icon: React.ReactNode;
  delay: number;
}) {
  const tones = {
    primary: "bg-primary/15 text-primary",
    destructive: "bg-destructive/15 text-destructive",
    success: "bg-success/15 text-success",
    accent: "bg-accent/15 text-accent",
  } as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="glass hover-lift rounded-3xl p-6 hover:scale-[1.02]"
    >
      <div className={`inline-flex rounded-2xl p-2.5 ${tones[tone]}`}>{icon}</div>
      <p className="text-muted-foreground mt-4 text-xs font-bold tracking-wide uppercase">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight">{value}</p>
    </motion.div>
  );
}
