import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  /** Data URL of the uploaded screenshot: data:image/png;base64,... */
  image: z
    .string()
    .trim()
    .regex(/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/, "Unsupported image")
    .max(9_000_000, "That image is too large — keep it under about 6 MB."),
  note: z.string().trim().max(400).optional(),
});

export type A11ySeverity = "critical" | "serious" | "moderate" | "minor";

export type A11yIssue = {
  title: string;
  severity: A11ySeverity;
  guideline: string;
  problem: string;
  fix: string;
};

export type A11yReport = {
  summary: string;
  score: number;
  issues: A11yIssue[];
};

const SYSTEM = [
  "You are an accessibility specialist reviewing a screenshot of a product UI.",
  "Judge only what is visible: colour contrast of text and icons, type size and line length, touch/click target size,",
  "visual hierarchy and focus affordances, reliance on colour alone to convey meaning, form label clarity,",
  "spacing and grouping, iconography without text, and content legibility over images.",
  "Reference the relevant WCAG 2.2 success criterion (e.g. '1.4.3 Contrast (Minimum)') for each issue.",
  "Be concrete and specific to what you can see — never generic advice, never invent things not in the screenshot.",
  "Each fix must be an actionable design change (exact colours, sizes in px, or layout changes) a designer can apply today.",
  "Give between 3 and 8 issues, most severe first. Score 0-100 where 100 is fully accessible.",
].join(" ");

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "Two or three plain sentences on the overall state." },
    score: { type: "integer", description: "Overall accessibility score from 0 to 100." },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          severity: { type: "string", enum: ["critical", "serious", "moderate", "minor"] },
          guideline: { type: "string", description: "WCAG criterion, e.g. '1.4.3 Contrast (Minimum)'." },
          problem: { type: "string" },
          fix: { type: "string" },
        },
        required: ["title", "severity", "guideline", "problem", "fix"],
      },
    },
  },
  required: ["summary", "score", "issues"],
} as const;

/** Review an uploaded design screenshot for accessibility problems. */
export const reviewScreenshotAccessibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<A11yReport> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured on this app.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "medium", summary: "auto" },
        text: {
          format: {
            type: "json_schema",
            name: "accessibility_report",
            strict: true,
            schema: SCHEMA,
          },
        },
        input: [
          { role: "system", content: [{ type: "input_text", text: SYSTEM }] },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: data.note
                  ? `Review this screen for accessibility issues. Context from the designer: ${data.note}`
                  : "Review this screen for accessibility issues.",
              },
              { type: "input_image", image_url: data.image },
            ],
          },
        ],
      }),
    });

    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Too many requests right now — try again shortly.");
      if (res.status === 402) throw new Error("AI credits are exhausted for this workspace.");
      throw new Error(`AI request failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let out = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const event = JSON.parse(payload) as {
            type?: string;
            delta?: string;
            response?: { output_text?: string };
          };
          if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
            out += event.delta;
          } else if (event.type === "response.completed" && !out) {
            out = event.response?.output_text ?? "";
          }
        } catch {
          // ignore keep-alive / malformed chunks
        }
      }
    }

    let parsed: A11yReport | null = null;
    try {
      parsed = JSON.parse(out.trim()) as A11yReport;
    } catch {
      parsed = null;
    }
    if (!parsed || !Array.isArray(parsed.issues)) {
      throw new Error("The review came back empty. Try uploading the screenshot again.");
    }

    return {
      summary: String(parsed.summary ?? "").trim(),
      score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0))),
      issues: parsed.issues.slice(0, 10).map((issue) => ({
        title: String(issue.title ?? "").trim(),
        severity: (["critical", "serious", "moderate", "minor"] as const).includes(issue.severity)
          ? issue.severity
          : "moderate",
        guideline: String(issue.guideline ?? "").trim(),
        problem: String(issue.problem ?? "").trim(),
        fix: String(issue.fix ?? "").trim(),
      })),
    };
  });
