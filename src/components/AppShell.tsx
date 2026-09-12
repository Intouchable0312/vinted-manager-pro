import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Boxes,
  Globe2,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageCircle,
  UserPlus,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/data";
import { computeDescriptor, loadImage } from "@/lib/face";
import { useSession } from "@/lib/session";

const TABS = [
  { to: "/accueil", label: "Accueil", icon: LayoutDashboard },
  { to: "/messagerie", label: "Messagerie", icon: MessageCircle },
  { to: "/emails", label: "E-mails", icon: Mail },
  { to: "/navigateurs", label: "Fenêtres", icon: Globe2 },
  { to: "/produits", label: "Produits", icon: Boxes },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { person, ready, signOut } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (ready && !person) navigate({ to: "/", replace: true });
  }, [ready, person, navigate]);

  if (!ready || !person) {
    return (
      <div className="bg-hero flex min-h-screen items-center justify-center">
        <div className="border-primary/40 border-t-primary h-12 w-12 animate-spin rounded-full border-4" />
      </div>
    );
  }

  return (
    <div className="bg-hero min-h-screen">
      <header className="sticky top-0 z-30 px-4 pt-4">
        <div className="glass mx-auto flex max-w-6xl flex-wrap items-center gap-3 rounded-3xl px-4 py-3">
          <Link to="/accueil" className="flex items-center gap-3">
            <img
              src="/favicon.png"
              alt="La Bectavance"
              className="ring-primary/40 h-11 w-11 rounded-2xl object-cover ring-2"
            />
            <span className="hidden text-xl sm:block">
              La <span className="text-money">Bectavance</span> 💸
            </span>
          </Link>

          <nav className="order-3 flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto sm:flex-1 sm:justify-center">
            {TABS.map((tab) => {
              const active = pathname.startsWith(tab.to);
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={`relative flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-all duration-300 ${
                    active
                      ? "bg-primary text-primary-foreground scale-105"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {person.is_admin ? (
              <button
                onClick={() => setAddOpen(true)}
                className="border-primary/50 text-primary hover:bg-primary/10 flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                <span className="hidden sm:block">Ajouter</span>
              </button>
            ) : null}
            <div className="bg-secondary flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold">
              <span className="bg-success h-2.5 w-2.5 rounded-full" />
              {person.name}
            </div>
            <button
              onClick={() => {
                signOut();
                navigate({ to: "/", replace: true });
              }}
              className="text-muted-foreground hover:text-destructive rounded-full p-2.5 transition-colors"
              aria-label="Se déconnecter"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-8 pb-24">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      </main>

      <AnimatePresence>
        {addOpen ? <AddPersonDialog onClose={() => setAddOpen(false)} /> : null}
      </AnimatePresence>
    </div>
  );
}

function AddPersonDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || files.length === 0) {
      toast.error("Un prénom et au moins une photo sont nécessaires.");
      return;
    }
    const slug = slugify(trimmed);
    setBusy(true);
    try {
      setStep("Création du profil…");
      const { data: person, error: personError } = await supabase
        .from("people")
        .insert({ name: trimmed, is_admin: false })
        .select()
        .single();
      if (personError || !person) throw personError ?? new Error("Profil impossible");

      let saved = 0;
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (!file) continue;
        setStep(`Analyse du visage ${index + 1}/${files.length}…`);
        const objectUrl = URL.createObjectURL(file);
        let descriptor: number[] | null = null;
        try {
          descriptor = await computeDescriptor(await loadImage(objectUrl));
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
        if (!descriptor) continue;

        const extension = (file.name.split(".").pop() ?? "jpg").toLowerCase();
        const fileName = `${slug}-${index + 1}.${extension}`;
        const path = `${slug}/${fileName}`;
        setStep(`Envoi de ${fileName}…`);
        const { error: uploadError } = await supabase.storage
          .from("faces")
          .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
        if (uploadError) throw uploadError;

        const { error: rowError } = await supabase.from("face_photos").insert({
          person_id: person.id,
          file_name: fileName,
          image_url: path,
          descriptor: descriptor as unknown as never,
        });
        if (rowError) throw rowError;
        saved += 1;
      }

      if (saved === 0) {
        await supabase.from("people").delete().eq("id", person.id);
        toast.error("Aucun visage détecté sur ces photos.");
        return;
      }
      toast.success(`${trimmed} peut maintenant se connecter (${saved} photo(s)).`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Échec de l'ajout");
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="glass w-full max-w-lg rounded-3xl p-8"
        initial={{ scale: 0.94, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl">Nouvelle personne</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Les photos sont renommées automatiquement au prénom choisi.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mt-6 block text-sm font-bold">Prénom</label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nathan"
          className="bg-input/60 focus:ring-ring mt-2 w-full rounded-2xl px-5 py-4 text-lg outline-none focus:ring-2"
        />

        <button
          onClick={() => inputRef.current?.click()}
          className="border-border hover:border-primary/60 mt-5 w-full rounded-2xl border-2 border-dashed px-5 py-8 text-sm font-bold transition-colors"
        >
          {files.length > 0
            ? `${files.length} photo(s) sélectionnée(s)`
            : "Choisir les photos du visage"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />

        {name.trim() && files.length > 0 ? (
          <p className="text-muted-foreground mt-3 text-xs">
            Seront enregistrées sous : {slugify(name)}-1, {slugify(name)}-2…
          </p>
        ) : null}

        <button
          onClick={submit}
          disabled={busy}
          className="bg-primary text-primary-foreground mt-6 w-full rounded-2xl px-6 py-4 text-base font-bold transition-transform hover:scale-[1.02] disabled:opacity-60"
        >
          {busy ? (step || "Enregistrement…") : "Enregistrer la personne"}
        </button>
      </motion.div>
    </motion.div>
  );
}
