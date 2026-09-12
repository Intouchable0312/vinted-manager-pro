import { createParser } from "eventsource-parser";
import { flushSync } from "react-dom";

type ImageEventPayload =
  | { type: "image_generation.partial_image"; b64_json: string; partial_image_index: number }
  | { type: "image_generation.completed"; b64_json: string }
  | { type: "error"; error: { message: string } };

const FRAME_EVENTS = new Set([
  "image_generation.partial_image",
  "image_generation.completed",
  "image_edit.partial_image",
  "image_edit.completed",
]);

/** Appelle la route d'édition et rend chaque aperçu au fur et à mesure. */
export async function streamEditedImage(
  endpoint: string,
  payload: { prompt: string; image: string },
  onFrame: (dataUrl: string, isFinal: boolean) => void,
): Promise<void> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) {
    throw new Error((await res.text().catch(() => "")) || `Échec (${res.status})`);
  }

  let sawAnyEvent = false;
  let sawCompleted = false;
  let streamError: string | undefined;

  const parser = createParser({
    onEvent(event) {
      let parsed: ImageEventPayload | undefined;
      try {
        parsed = JSON.parse(event.data) as ImageEventPayload;
      } catch {
        /* message générique */
      }
      if (event.event === "error" || parsed?.type === "error") {
        sawAnyEvent = true;
        streamError =
          (parsed as { error?: { message?: string } } | undefined)?.error?.message ??
          "La retouche a échoué";
        return;
      }
      if (!event.event || !FRAME_EVENTS.has(event.event) || !parsed) return;
      sawAnyEvent = true;
      const isFinal =
        event.event === "image_generation.completed" || event.event === "image_edit.completed";
      const b64 = (parsed as { b64_json?: string }).b64_json;
      if (!b64) return;
      flushSync(() => {
        onFrame(`data:image/png;base64,${b64}`, isFinal);
      });
      if (isFinal) sawCompleted = true;
    },
  });

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.feed(value);
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  if (streamError) throw new Error(streamError);

  if (!sawAnyEvent) {
    const replay = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, stream: false }),
    });
    if (!replay.ok) {
      throw new Error((await replay.text().catch(() => "")) || `Échec (${replay.status})`);
    }
    const json = (await replay.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("Aucune image renvoyée");
    onFrame(`data:image/png;base64,${b64}`, true);
    return;
  }

  if (!sawCompleted) throw new Error("La retouche s'est interrompue");
}
