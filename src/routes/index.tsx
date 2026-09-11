import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScanFace, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { fetchFacePhotos, fetchPeople, signedUrl, type Person } from "@/lib/data";
import {
  MATCH_THRESHOLD,
  computeDescriptor,
  descriptorFromUrl,
  euclideanDistance,
  loadFaceEngine,
} from "@/lib/face";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "La Bectavance 💸 — Accès par visage" },
      {
        name: "description",
        content:
          "Accès privé à La Bectavance : identification par reconnaissance du visage, sans mot de passe.",
      },
      { property: "og:title", content: "La Bectavance 💸 — Accès par visage" },
      {
        property: "og:description",
        content: "Espace privé de gestion Vinted, accessible uniquement par reconnaissance du visage.",
      },
    ],
  }),
  component: FaceGate,
  ssr: false,
});

interface Reference {
  person: Person;
  descriptor: number[];
}

type Phase = "loading" | "scanning" | "matched" | "error";

function FaceGate() {
  const navigate = useNavigate();
  const { person: current, signIn } = useSession();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(true);

  const [phase, setPhase] = useState<Phase>("loading");
  const [status, setStatus] = useState("Préparation de la caméra…");
  const [matched, setMatched] = useState<Person | null>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (current) navigate({ to: "/accueil", replace: true });
  }, [current, navigate]);

  const buildReferences = useCallback(async (): Promise<Reference[]> => {
    const [people, photos] = await Promise.all([fetchPeople(), fetchFacePhotos()]);
    const byId = new Map(people.map((entry) => [entry.id, entry]));
    const references: Reference[] = [];

    for (const photo of photos) {
      const owner = byId.get(photo.person_id);
      if (!owner) continue;
      const stored = Array.isArray(photo.descriptor) ? (photo.descriptor as number[]) : null;
      if (stored && stored.length === 128) {
        references.push({ person: owner, descriptor: stored });
        continue;
      }
      try {
        const url = await signedUrl("faces", photo.image_url);
        const computed = await descriptorFromUrl(url);
        if (computed) {
          await supabase
            .from("face_photos")
            .update({ descriptor: computed as unknown as never })
            .eq("id", photo.id);
          references.push({ person: owner, descriptor: computed });
        }
      } catch {
        /* photo illisible, on passe */
      }
    }
    return references;
  }, []);

  useEffect(() => {
    runningRef.current = true;

    (async () => {
      try {
        setStatus("Chargement du moteur de reconnaissance…");
        await loadFaceEngine();

        setStatus("Lecture des visages enregistrés…");
        const references = await buildReferences();
        if (references.length === 0) {
          setPhase("error");
          setStatus("Aucun visage n'est enregistré dans la base.");
          return;
        }

        setStatus("Activation de la caméra…");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 1280, height: 720 },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        setPhase("scanning");
        setStatus("Regarde bien l'objectif…");

        while (runningRef.current) {
          const descriptor = await computeDescriptor(video);
          if (descriptor) {
            let best: Reference | null = null;
            let bestDistance = Number.POSITIVE_INFINITY;
            for (const reference of references) {
              const distance = euclideanDistance(descriptor, reference.descriptor);
              if (distance < bestDistance) {
                bestDistance = distance;
                best = reference;
              }
            }
            if (best && bestDistance < MATCH_THRESHOLD) {
              runningRef.current = false;
              setMatched(best.person);
              setPhase("matched");
              stream.getTracks().forEach((track) => track.stop());
              const person = best.person;
              window.setTimeout(() => {
                signIn({ id: person.id, name: person.name, is_admin: person.is_admin });
                navigate({ to: "/accueil", replace: true });
              }, 2600);
              return;
            }
            setAttempts((value) => value + 1);
            setStatus("Visage inconnu, ajuste-toi et reste immobile…");
          } else {
            setStatus("Aucun visage détecté, place ta tête au centre…");
          }
          await new Promise((resolve) => window.setTimeout(resolve, 450));
        }
      } catch (error) {
        setPhase("error");
        setStatus(
          error instanceof Error && error.name === "NotAllowedError"
            ? "L'accès à la caméra a été refusé. Autorise-le pour entrer."
            : "La caméra n'est pas disponible sur cet appareil.",
        );
      }
    })();

    return () => {
      runningRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [buildReferences, navigate, signIn]);

  return (
    <div className="bg-hero relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-16">
      <motion.div
        className="bg-primary/20 pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full blur-3xl"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 8, repeat: Infinity }}
      />
      <motion.div
        className="bg-accent/20 pointer-events-none absolute -right-24 -bottom-32 h-96 w-96 rounded-full blur-3xl"
        animate={{ scale: [1.1, 1, 1.1] }}
        transition={{ duration: 9, repeat: Infinity }}
      />

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 flex flex-col items-center text-center"
      >
        <img
          src="/favicon.png"
          alt="La Bectavance"
          className="ring-primary/40 h-20 w-20 animate-float rounded-3xl object-cover ring-2"
        />
        <h1 className="mt-6 text-5xl sm:text-6xl">
          La <span className="text-money">Bectavance</span> 💸
        </h1>
        <p className="text-muted-foreground mt-3 max-w-sm text-base font-medium">
          Accès réservé. Ton visage est la seule clé.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 22 }}
        className="glass relative z-10 mt-10 w-full max-w-md overflow-hidden rounded-3xl p-6"
      >
        <div className="bg-background/60 relative aspect-[4/3] overflow-hidden rounded-2xl">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full scale-x-[-1] object-cover"
          />
          {phase === "scanning" ? (
            <>
              <div className="border-primary/70 pointer-events-none absolute inset-8 rounded-[2rem] border-2" />
              <motion.div
                className="via-primary pointer-events-none absolute inset-x-8 h-1 rounded-full bg-gradient-to-r from-transparent to-transparent"
                style={{ top: "50%" }}
                animate={{ top: ["16%", "82%", "16%"] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              />
            </>
          ) : null}

          <AnimatePresence>
            {phase === "matched" && matched ? (
              <motion.div
                className="bg-background/85 absolute inset-0 flex flex-col items-center justify-center backdrop-blur-md"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <motion.div
                  initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 220, damping: 14 }}
                  className="bg-primary/15 text-primary rounded-full p-5"
                >
                  <Sparkles className="h-10 w-10" />
                </motion.div>
                <motion.h2
                  className="mt-5 text-4xl"
                  initial={{ y: 18, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.25 }}
                >
                  Bienvenue {matched.name}
                </motion.h2>
                <motion.p
                  className="text-muted-foreground mt-2 text-sm font-bold"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                >
                  Ouverture de ton espace privé…
                </motion.p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <div
            className={`rounded-2xl p-3 ${
              phase === "error" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"
            }`}
          >
            <ScanFace className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{status}</p>
            {phase === "scanning" ? (
              <p className="text-muted-foreground text-xs font-medium">
                Analyse en cours · {attempts} comparaison(s)
              </p>
            ) : null}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
