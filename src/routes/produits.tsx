import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, ImagePlus, Plus, Trash2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { faviconFor, hostOf, signedUrl, slugify, type Product } from "@/lib/data";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/produits")({
  head: () => ({
    meta: [
      { title: "Produits — La Bectavance 💸" },
      {
        name: "description",
        content: "Catalogue des produits suivis : image, titre et lien, ouverts en interne.",
      },
      { property: "og:title", content: "Produits — La Bectavance 💸" },
      {
        property: "og:description",
        content: "Ajoute une image, un titre et un lien pour garder tes produits au même endroit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <ProductsPage />
    </AppShell>
  ),
  ssr: false,
});

function ProductsPage() {
  const { person } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Product[];
      return Promise.all(
        rows.map(async (row) => ({
          ...row,
          image_url: row.image_url?.startsWith("storage:")
            ? await signedUrl("media", row.image_url.replace("storage:", ""))
            : row.image_url,
        })),
      );
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const cleanTitle = title.trim();
      const cleanUrl = url.trim();
      if (!cleanTitle || !cleanUrl) throw new Error("missing");
      const normalized = cleanUrl.startsWith("http") ? cleanUrl : `https://${cleanUrl}`;

      let image = faviconFor(normalized, 256);
      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `products/${slugify(cleanTitle)}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("media").upload(path, file, {
          upsert: true,
          contentType: file.type || "image/jpeg",
        });
        if (upErr) throw upErr;
        image = `storage:${path}`;
      }

      const { error } = await supabase.from("products").insert({
        person_id: person?.id ?? null,
        title: cleanTitle,
        image_url: image,
        url: normalized,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle("");
      setUrl("");
      setFile(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      toast.success("Produit ajouté");
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: () => toast.error("Ajout impossible"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Supprimé");
      queryClient.invalidateQueries({ queryKey: ["products"] });
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
        <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Catalogue</p>
        <h1 className="text-4xl md:text-5xl">Produits</h1>
      </motion.header>

      <motion.section
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        className="glass rounded-3xl p-5 md:p-7"
      >
        <div className="grid gap-4 md:grid-cols-[160px_1fr_1fr_auto] md:items-center">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="hover-lift flex h-[112px] items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-surface-2/50 text-muted-foreground hover:scale-[1.02]"
          >
            {preview ? (
              <img src={preview} alt="Aperçu du produit" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-2 text-xs">
                <ImagePlus className="size-6" />
                Image
              </span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const picked = event.target.files?.[0] ?? null;
              setFile(picked);
              setPreview(picked ? URL.createObjectURL(picked) : null);
            }}
          />

          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Titre"
            className="h-14 rounded-2xl border border-input bg-surface-2/60 px-5 text-base outline-none transition focus:border-ring"
          />
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Lien"
            className="h-14 rounded-2xl border border-input bg-surface-2/60 px-5 text-base outline-none transition focus:border-ring"
          />
          <button
            type="button"
            disabled={create.isPending}
            onClick={() => create.mutate()}
            className="hover-lift flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary px-6 font-semibold text-primary-foreground hover:scale-[1.03] disabled:opacity-60"
          >
            <Plus className="size-5" />
            Ajouter
          </button>
        </div>
      </motion.section>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-3xl bg-surface-2/60" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="glass rounded-3xl p-10 text-center text-muted-foreground">
          Aucun produit pour l'instant.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {products.map((product, index) => (
              <motion.article
                key={product.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
                className="glass hover-lift group overflow-hidden rounded-3xl hover:scale-[1.015]"
              >
                <div className="relative h-44 overflow-hidden bg-surface-2">
                  <img
                    src={product.image_url}
                    alt={product.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <button
                    type="button"
                    onClick={() => remove.mutate(product.id)}
                    className="absolute right-3 top-3 rounded-full bg-background/70 p-2 opacity-0 backdrop-blur transition group-hover:opacity-100"
                    aria-label={`Supprimer ${product.title}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="space-y-3 p-5">
                  <h2 className="line-clamp-2 text-xl">{product.title}</h2>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    {hostOf(product.url)}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      navigate({ to: "/navigateurs", search: { url: product.url } })
                    }
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface-2/60 text-sm font-semibold transition hover:bg-surface-2"
                  >
                    <ExternalLink className="size-4" />
                    Ouvrir en interne
                  </button>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
