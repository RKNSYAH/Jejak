import { interpretOnboardingStory } from "@/app/engine/controller/preferenceController";
import { getAuthenticatedClaims } from "@/app/engine/controller/userServerController";
import { isLangflowConfigured, LangflowError, type LangflowErrorCode } from "@/app/engine/lib/langflow";

const MAX_MESSAGE_LENGTH = 4000;
const SENSITIVE_INPUT = /\b(nik|ktp|passport|paspor|religion|agama|ethnicity|etnis|diagnosis|alamat rumah|home address)\b|(?<!\d)(?:\d[ -]?){16}(?!\d)/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request" }, { status: 400 });
  }

  if (
    !isRecord(body) || Object.keys(body).some((key) => !["message", "language"].includes(key)) ||
    typeof body.message !== "string" || body.message.trim().length === 0 || body.message.length > MAX_MESSAGE_LENGTH ||
    (body.language !== "id" && body.language !== "en")
  ) {
    return Response.json({ error: "Invalid onboarding input" }, { status: 400 });
  }

  if (SENSITIVE_INPUT.test(body.message)) {
    return Response.json({ error: "Remove sensitive personal information before continuing" }, { status: 400 });
  }

  // LF-05 spends model credits, so only signed-in users can run it.
  const claims = await getAuthenticatedClaims().catch(() => null);
  if (!claims) {
    return Response.json({ error: "Masuk terlebih dahulu untuk menganalisis rencana." }, { status: 401 });
  }

  if (!isLangflowConfigured()) {
    return Response.json({ error: "Fitur analisis cerita belum siap. Coba lagi nanti." }, { status: 503 });
  }

  try {
    return Response.json({ profile: await interpretOnboardingStory(body.message, body.language) });
  } catch (error) {
    if (!(error instanceof LangflowError)) {
      return Response.json({ error: "Ringkasan rencana tidak dapat digunakan. Coba lagi." }, { status: 502 });
    }
    const [message, status] = flowErrors[error.code];
    return Response.json({ error: message }, { status });
  }
}

const flowErrors: Record<LangflowErrorCode, [string, number]> = {
  config: ["Fitur analisis cerita belum siap. Coba lagi nanti.", 503],
  timeout: ["Analisis rencana memerlukan waktu terlalu lama. Coba lagi.", 504],
  unreachable: ["Rencana belum bisa dianalisis. Coba lagi.", 502],
  upstream: ["Rencana belum bisa dianalisis. Coba lagi.", 502],
  invalid_response: ["Ringkasan rencana tidak bisa dibaca. Coba lagi.", 502],
  incomplete: ["Analisis rencana belum selesai. Coba lagi.", 502],
  invalid_output: ["Ringkasan rencana tidak dapat digunakan. Coba lagi.", 502],
};
