import { createFileRoute } from "@tanstack/react-router";

interface EditPayload {
  prompt?: unknown;
  image?: unknown;
  stream?: unknown;
}

export const Route = createFileRoute("/api/edit-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const body = (await request.json()) as EditPayload;
        const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
        const image = typeof body.image === "string" ? body.image : "";
        const stream = body.stream !== false;

        if (!prompt || !image.startsWith("data:image/")) {
          return new Response("Une image et une consigne sont nécessaires.", { status: 400 });
        }

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-pro-image",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Modifie cette image en suivant la consigne, en gardant le cadrage et le réalisme : ${prompt}`,
                  },
                  { type: "image_url", image_url: { url: image } },
                ],
              },
            ],
            modalities: ["image", "text"],
            ...(stream ? { stream: true } : {}),
          }),
        });

        if (!upstream.ok || !upstream.body) {
          return new Response(await upstream.text(), { status: upstream.status });
        }

        if (!stream) {
          return new Response(upstream.body, {
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(upstream.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
