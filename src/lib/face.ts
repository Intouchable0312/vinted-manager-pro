/**
 * Reconnaissance faciale : chargement des modèles + calcul d'empreintes (128 valeurs).
 * Tout tourne dans le navigateur (aucune image envoyée à un service tiers).
 */

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";

type FaceApi = typeof import("@vladmandic/face-api");

let loader: Promise<FaceApi> | null = null;

export function loadFaceEngine(): Promise<FaceApi> {
  if (!loader) {
    loader = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      return faceapi;
    })().catch((error) => {
      loader = null;
      throw error;
    });
  }
  return loader;
}

export type FaceInput = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

export async function computeDescriptor(input: FaceInput): Promise<number[] | null> {
  const faceapi = await loadFaceEngine();
  const detection = await faceapi
    .detectSingleFace(
      input as HTMLCanvasElement,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.35 }),
    )
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!detection) return null;
  return Array.from(detection.descriptor);
}

export async function descriptorFromUrl(url: string): Promise<number[] | null> {
  const image = await loadImage(url);
  return computeDescriptor(image);
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image illisible"));
    image.src = url;
  });
}

export function euclideanDistance(a: number[], b: number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = a[i] - b[i];
    total += diff * diff;
  }
  return Math.sqrt(total);
}

/** Seuil de correspondance : en dessous, c'est la même personne. */
export const MATCH_THRESHOLD = 0.52;
