import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, ImagePlus, RotateCcw, Sparkles, Wand2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { streamEditedImage } from "@/lib/streamImage";

export const Route = createFileRoute("/retouche")({
  head: () => ({
    meta: [
      { title: "Retouche IA — La Bectavance 💸" },
      {
        name: "description",
        content: "Modifie une photo existante avec une simple consigne écrite, sans quitter le site.",
      },
      { property: "og:title", content: "Retouche IA — La Bectavance 💸" },
      {
        property: "og:description",
        content: "Charge une image, écris ce que tu veux changer, et récupère le résultat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <RetouchePage />
    </AppShell>
  ),
  ssr: false,
});

const IDEAS = [
  "Fond blanc de studio, lumière douce",
  "Enlève les plis et repasse le vêtement",
  "Rends les couleurs plus vives et nettes",
  "Supprime l'arrière-plan encombré",
];

/** Réduit l'image pour un envoi rapide et fiable. */
async function toDataUrl(file: File, max = 1400): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Image illisible"));
      element.src = objectUrl;
    });
    const scale = Math.min(1, max / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas indisponible");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function RetouchePage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [isFinal, setIsFinal] = useState(false);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | null) {
    if (!file) return;
    try {
      const dataUrl = await toDataUrl(file);
      setSource(dataUrl);
      setResult(null);
      setIsFinal(false);
    } catch {
      toast.error("Cette image n'a pas pu être ouverte");
    }
  }

  async function run() {
    if (!source) {
      toast.error("Choisis d'abord une image");
      return;
    }
    if (!prompt.trim()) {
      toast.error("Écris ce que tu veux changer");
      return;
    }
    setBusy(true);
    setResult(null);
    setIsFinal(false);
    try {
      await streamEditedImage(
        "/api/edit-image",
        { prompt: prompt.trim(), image: source },
        (dataUrl, final) => {
          setResult(dataUrl);
          if (final) setIsFinal(true);
        },
      );
      toast.success("Image retouchée");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La retouche a échoué");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <motion.header
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-2"
      >
        <p className="text-muted-foreground text-sm tracking-[0.3em] uppercase">Studio</p>
        <h1 className="text-4xl md:text-5xl">Retouche IA</h1>
      </motion.header>

      <motion.section
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        className="glass space-y-5 rounded-3xl p-5 md:p-7"
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="border-border bg-surface-2/50 hover:border-ring flex aspect-square items-center justify-center overflow-hidden rounded-3xl border border-dashed transition"
          >
            {source ? (
              <img src={source} alt="Image d'origine" className="h-full w-full object-contain" />
            ) : (
              <span className="text-muted-foreground flex flex-col items-center gap-3 text-sm font-bold">
                <ImagePlus className="size-8" />
                Choisir une image
              </span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => void pick(event.target.files?.[0] ?? null)}
          />

          <div className="bg-surface-2/40 border-border relative flex aspect-square items-center justify-center overflow-hidden rounded-3xl border">
            <AnimatePresence mode="wait">
              {result ? (
                <motion.img
                  key={isFinal ? "final" : "partial"}
                  src={result}
                  alt="Résultat de la retouche"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.35 }}
                  className={`h-full w-full object-contain transition-[filter] duration-500 ${
                    isFinal ? "blur-0" : "blur-xl"
                  }`}
                />
              ) : (
                <motion.span
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-muted-foreground flex flex-col items-center gap-3 text-sm font-bold"
                >
                  <Sparkles className={`size-8 ${busy ? "animate-pulse" : ""}`} />
                  {busy ? "Retouche en cours…" : "Le résultat s'affichera ici"}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={3}
          placeholder="Ex : mets l'article sur un fond blanc épuré et éclaire mieux le tissu"
          className="bg-surface-2/60 border-input focus:border-ring w-full resize-none rounded-2xl border px-5 py-4 text-base outline-none transition"
        />

        <div className="flex flex-wrap gap-2">
          {IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => setPrompt(idea)}
              className="border-border text-muted-foreground hover:text-foreground rounded-full border px-4 py-2 text-xs font-bold transition hover:bg-white/5"
            >
              {idea}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className="bg-primary text-primary-foreground flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl px-6 text-base font-bold transition-transform hover:scale-[1.02] disabled:opacity-60"
          >
            <Wand2 className="size-5" />
            {busy ? "Retouche en cours…" : "Retoucher l'image"}
          </button>

          {result && isFinal ? (
            <a
              href={result}
              download="retouche.png"
              className="border-border flex h-14 items-center justify-center gap-2 rounded-2xl border px-6 text-sm font-bold transition hover:bg-white/5"
            >
              <Download className="size-4" />
              Télécharger
            </a>
          ) : null}

          {result ? (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setIsFinal(false);
              }}
              className="border-border flex h-14 items-center justify-center gap-2 rounded-2xl border px-6 text-sm font-bold transition hover:bg-white/5"
            >
              <RotateCcw className="size-4" />
              Recommencer
            </button>
          ) : null}
        </div>
      </motion.section>
    </div>
  );
}
