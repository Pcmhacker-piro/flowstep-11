// Server-only adapters for BYO-key AI providers.
// Each adapter can (1) validate an API key against the provider's `/models`
// endpoint and (2) build a streaming chat-completions request compatible with
// the OpenAI SSE format the client already parses.
import { type ProviderId } from "./providers";
export type { ProviderId } from "./providers";
export { PROVIDER_LABELS, PROVIDER_HELP, ALL_PROVIDERS } from "./providers";


interface ProviderConfig {
  validateUrl: string;
  chatUrl: string;
  headers: (key: string) => Record<string, string>;
  stripModelPrefix: boolean; // when true, remove `vendor/` before sending
  // Optional model translation. For Anthropic, OpenAI-compat requires the raw model id.
}

const CONFIGS: Record<ProviderId, ProviderConfig> = {
  openai: {
    validateUrl: "https://api.openai.com/v1/models",
    chatUrl: "https://api.openai.com/v1/chat/completions",
    headers: (k) => ({ Authorization: `Bearer ${k}`, "Content-Type": "application/json" }),
    stripModelPrefix: true,
  },
  gemini: {
    // Google's OpenAI-compatible endpoint.
    validateUrl: "https://generativelanguage.googleapis.com/v1beta/openai/models",
    chatUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    headers: (k) => ({ Authorization: `Bearer ${k}`, "Content-Type": "application/json" }),
    stripModelPrefix: true,
  },
  openrouter: {
    validateUrl: "https://openrouter.ai/api/v1/key",
    chatUrl: "https://openrouter.ai/api/v1/chat/completions",
    headers: (k) => ({
      Authorization: `Bearer ${k}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://flowstep.app",
      "X-Title": "Flowstep",
    }),
    stripModelPrefix: false, // OpenRouter uses vendor/model natively
  },
  anthropic: {
    validateUrl: "https://api.anthropic.com/v1/models",
    chatUrl: "https://api.anthropic.com/v1/chat/completions",
    headers: (k) => ({
      "x-api-key": k,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    }),
    stripModelPrefix: true,
  },
  nvidia: {
    validateUrl: "https://integrate.api.nvidia.com/v1/models",
    chatUrl: "https://integrate.api.nvidia.com/v1/chat/completions",
    headers: (k) => ({ Authorization: `Bearer ${k}`, "Content-Type": "application/json" }),
    stripModelPrefix: false,
  },
  groq: {
    validateUrl: "https://api.groq.com/openai/v1/models",
    chatUrl: "https://api.groq.com/openai/v1/chat/completions",
    headers: (k) => ({ Authorization: `Bearer ${k}`, "Content-Type": "application/json" }),
    stripModelPrefix: true,
  },
};

/** Validate an API key by hitting the provider's models endpoint. */
export async function validateProviderKey(
  provider: ProviderId,
  apiKey: string,
): Promise<{ ok: boolean; status: number; message?: string }> {
  const cfg = CONFIGS[provider];
  try {
    const res = await fetch(cfg.validateUrl, { method: "GET", headers: cfg.headers(apiKey) });
    if (res.ok) return { ok: true, status: res.status };
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.text();
      const trimmed = body.slice(0, 300);
      if (trimmed) msg = trimmed;
    } catch {}
    return { ok: false, status: res.status, message: msg };
  } catch (err) {
    return { ok: false, status: 0, message: err instanceof Error ? err.message : "Network error" };
  }
}

/** Pick the best BYO provider for a given `vendor/model` string. */
export function pickProviderForModel(
  modelId: string,
  availableProviders: Set<ProviderId>,
): ProviderId | null {
  const vendor = modelId.split("/")[0]?.toLowerCase();
  if (vendor === "openai" && availableProviders.has("openai")) return "openai";
  if (vendor === "google" && availableProviders.has("gemini")) return "gemini";
  if (vendor === "anthropic" && availableProviders.has("anthropic")) return "anthropic";
  // Fallback: OpenRouter can route almost any vendor/model.
  if (availableProviders.has("openrouter")) return "openrouter";
  // Last-ditch — try direct vendor if we have their key.
  if (vendor === "openai" && availableProviders.has("openai")) return "openai";
  return null;
}

/**
 * Map a Lovable-gateway `vendor/model` id to an ordered list of model ids the
 * provider's own API may accept, strongest first. Design quality depends heavily
 * on landing on a flagship model, so we ask for the best one and only step down
 * when the provider answers 404/429 for it.
 */
function mapModelForProvider(provider: ProviderId, modelId: string): string[] {
  const [, name = ""] = modelId.split("/");
  const lower = name.toLowerCase();
  if (provider === "gemini") {
    // Strongest first. Flash-lite is never used as an automatic fallback: it
    // produces visibly weaker layouts, so only an explicit lite pick lands there.
    if (lower.includes("flash-lite") || lower.includes("flash_lite"))
      return ["gemini-flash-lite-latest", "gemini-flash-latest"];
    if (lower.includes("flash")) return ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-pro"];
    return ["gemini-2.5-pro", "gemini-pro-latest", "gemini-flash-latest"];
  }
  if (provider === "openai") {
    // Lovable exposes ids like gpt-6-astra that don't exist on OpenAI direct — ask for the
    // strongest real model first, then step down through ids every account can serve.
    const small = lower.includes("mini") || lower.includes("nano") || lower.includes("luna");
    if (lower.startsWith("gpt-5") || lower.startsWith("gpt-6") || lower.includes("sol") || lower.includes("terra") || lower.includes("luna")) {
      return small
        ? ["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"]
        : ["gpt-5.1", "gpt-5", "gpt-4.1", "gpt-4o"];
    }
    return [name || "gpt-4.1", "gpt-4.1", "gpt-4o"];
  }
  if (provider === "anthropic") {
    if (lower.includes("haiku")) return ["claude-haiku-4-5", "claude-3-5-haiku-latest"];
    if (lower.includes("opus")) return ["claude-opus-4-5", "claude-opus-4-20250514", "claude-sonnet-4-5"];
    return ["claude-sonnet-4-5", "claude-sonnet-4-20250514"];
  }
  if (provider === "openrouter") return [modelId]; // native vendor/model
  return [name || modelId];
}

/** Providers whose OpenAI-compatible endpoint accepts image parts in a user message. */
const VISION_PROVIDERS = new Set<ProviderId>(["openai", "gemini", "openrouter", "anthropic"]);

/** Generous completion budgets — premium design HTML routinely runs past 8k tokens. */
const OUTPUT_BUDGET: Record<ProviderId, number> = {
  openai: 32768,
  gemini: 32768,
  openrouter: 32768,
  anthropic: 32000,
  nvidia: 16384,
  groq: 16384,
};

/**
 * Gemini (Flash especially) defaults to safe, generic admin-panel layouts with
 * flat grey cards, uniform type and no focal point. This addendum forces the
 * same craft bar the stronger models hit on their own.
 */
const GEMINI_CRAFT_ADDENDUM = `NON-NEGOTIABLE CRAFT BAR — you are a senior product designer, not a wireframe generator.

Composition
- Establish a clear visual hierarchy: one dominant focal area, secondary supporting blocks, quiet tertiary detail. Never a flat grid of same-weight cards.
- Use an intentional asymmetric layout with real structure (sidebar + content + detail rail, or hero + dense supporting sections). Vary column widths; never split everything 50/50.
- Generous, deliberate spacing: section rhythm of 48-96px, card padding 20-32px, consistent 8px scale. No cramped rows, no uniform 16px everywhere.

Type
- Strong typographic contrast: display heading 32-56px with tight tracking (-0.02em), section labels 11-12px uppercase with wide tracking, body 14-15px at 1.5-1.6 line-height.
- Use one distinctive Google font pairing loaded via <link> (never Inter + Poppins defaults, never system-ui only). Numerals in data UI use a mono or tabular face.

Colour and surface
- Commit to one opinionated palette: a real brand hue with 2-3 tonal steps, one accent, warm or cool neutrals — never plain #fff on #f5f5f5 grey with blue links.
- Layer surfaces with subtle depth: hairline borders (1px at ~8% ink), soft large-radius shadows, slight tint differences between page, panel and card. Radii consistent (10-16px), never mixed randomly.

Detail that reads as premium
- Real, specific content: plausible names, dates, numbers, copy — never "Lorem ipsum" or "Item 1".
- Considered states: hover/focus styles, active nav treatment, badges/chips with tinted backgrounds matching their meaning, empty-state and loading polish where relevant.
- Crisp inline SVG icons (1.5px stroke, consistent 20px box). No emoji as icons, no icon fonts.
- Responsive: layout reflows sensibly at 834px and 390px using flex/grid and media queries.

Before writing, silently plan the grid, palette, type scale and focal point; then output only the finished HTML document.`;

/** Pull the human-readable error out of a provider's error body. */
export function providerErrorMessage(provider: ProviderId, status: number, body: string): string {
  let detail = "";
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string };
    if (typeof parsed.error === "string") detail = parsed.error;
    else if (parsed.error?.message) detail = parsed.error.message;
  } catch {
    detail = body.slice(0, 300);
  }
  if (status === 429)
    return `Your ${provider} key hit its rate limit or free-tier quota. ${detail || "Wait a minute and try again, or use a key with a paid quota."}`;
  if (status === 401 || status === 403)
    return `Your ${provider} key was rejected (${status}). Re-add it on the API keys page. ${detail}`.trim();
  if (status === 404)
    return `That model isn't available on your ${provider} key. ${detail}`.trim();
  return detail || `${provider} request failed (${status})`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Kick off an upstream streaming chat completion using the user's key.
 * Free-tier keys (Gemini especially) rate-limit aggressively, so retry 429/5xx
 * with backoff and fall back to a lighter model when the requested one is
 * unavailable or throttled.
 */
export async function streamChatWithUserKey(params: {
  provider: ProviderId;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  /** Reference images (data URLs or https URLs) the design must follow. */
  images?: string[];
  /** Partial output already produced — used to resume a truncated generation. */
  continueFrom?: string;
}): Promise<Response> {
  const cfg = CONFIGS[params.provider];
  const candidates = mapModelForProvider(params.provider, params.model).slice();
  if (params.provider === "gemini") {
    // Free Gemini keys can 429 on paid-tier aliases, so keep capable fallbacks
    // behind the requested model. Flash-lite is last resort only.
    for (const fallback of ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest"]) {
      if (!candidates.includes(fallback)) candidates.push(fallback);
    }
  }
  const images = (params.images ?? []).filter((src) => typeof src === "string" && src.length > 0);
  const useImages = images.length > 0 && VISION_PROVIDERS.has(params.provider);

  const attempt = async (model: string, dropBudget = false) => {
    const userContent = useImages
      ? [
          { type: "text", text: params.userPrompt },
          {
            type: "text",
            text: "REFERENCE IMAGES (attached): treat these as the visual brief. Match their layout structure, palette, typographic scale, spacing rhythm, component shapes and mood. Never describe them in the output — only build.",
          },
          ...images.map((src) => ({ type: "image_url", image_url: { url: src } })),
        ]
      : params.userPrompt;

    const messages: Array<{ role: string; content: unknown }> = [
      { role: "system", content: params.systemPrompt },
      ...(params.provider === "gemini"
        ? [{ role: "system" as const, content: GEMINI_CRAFT_ADDENDUM }]
        : []),
      { role: "user", content: userContent },
    ];

    if (params.continueFrom) {
      messages.push({ role: "assistant", content: params.continueFrom });
      messages.push({
        role: "user",
        content:
          "Your previous message was cut off. Continue the output from exactly where it stopped, mid-token if needed. Do not repeat anything already sent, do not restart, do not add commentary or code fences.",
      });
    }
    const budget = OUTPUT_BUDGET[params.provider];
    const body: Record<string, unknown> = {
      model,
      stream: true,
      messages,
    };
    if (!dropBudget) {
      // Design HTML can run 900+ lines — give the model room so output isn't truncated mid-document.
      body.max_tokens = budget;
      // Low-but-not-zero sampling keeps craft consistent without flattening the composition.
      body.temperature = 0.7;
    }

    // OpenAI's newer reasoning models reject sampling knobs but need a generous completion budget.
    if (params.provider === "openai" && /^(o\d|gpt-5|gpt-6)/i.test(model)) {
      delete body.max_tokens;
      delete body.temperature;
      if (!dropBudget) body.max_completion_tokens = budget;
    }

    // Gemini's OpenAI-compatible endpoint drifts off-brief at higher temperature
    // and skips structure without a little planning, so tighten sampling and give
    // it light thinking. Both knobs are dropped on the provider-defaults retry.
    if (params.provider === "gemini" && !dropBudget) {
      body.temperature = 0.45;
      body.top_p = 0.9;
      // Flash skips composition work with light thinking — give it real planning budget.
      body.reasoning_effort = params.continueFrom ? "low" : "high";
    }

    return fetch(cfg.chatUrl, {
      method: "POST",
      headers: cfg.headers(params.apiKey),
      body: JSON.stringify(body),
    });
  };

  let last: Response | null = null;
  for (const model of candidates) {
    // A 429 here is a per-model quota block, not a burst limit — move to the next
    // model instead of burning seconds on backoff. Only 5xx is worth retrying.
    const maxTries = 3;
    for (let tries = 0; tries < maxTries; tries += 1) {
      let res = await attempt(model);
      if (res.ok) return res;
      if (res.status === 400) {
        // Some accounts reject the large budget or the sampling knob — retry the same
        // model with the provider defaults before stepping down to a weaker model.
        await res.body?.cancel().catch(() => {});
        res = await attempt(model, true);
        if (res.ok) return res;
      }
      last = res;
      if (res.status < 500) break;
      if (tries < maxTries - 1) {
        await res.body?.cancel().catch(() => {});
        await sleep(2000 * (tries + 1));
      }
    }
    if (last && last.status !== 429 && last.status !== 404 && last.status < 500) break;
  }
  return last as Response;
}

