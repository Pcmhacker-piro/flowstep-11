import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ question: z.string().trim().min(2).max(500) });

const SYSTEM = [
  "You are Flowstep's activity analyst. You answer questions about a designer's own",
  "design activity log (created / updated / renamed / duplicated / deleted / shared / unshared events).",
  "Ground every statement in the supplied log. Give short, concrete answers in markdown-free plain text,",
  "using dates and design names. If the log does not contain the answer, say so plainly.",
  "Keep answers under 180 words.",
].join(" ");

/** Ask a natural-language question about your own activity history. */
export const askActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }): Promise<{ answer: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured on this app.");

    const { data: rows, error } = await context.supabase
      .from("design_activity")
      .select("design_name, action, detail, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    if (!rows || rows.length === 0) {
      return {
        answer:
          "There's no activity recorded yet, so there's nothing to summarize. Create or edit a design and it will show up here.",
      };
    }

    const log = rows
      .map(
        (r) =>
          `${new Date(r.created_at).toISOString()} | ${r.action} | ${r.design_name}${
            r.detail ? ` | ${r.detail}` : ""
          }`,
      )
      .join("\n");

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
        reasoning: { effort: "low", summary: "auto" },
        input: [
          { role: "system", content: [{ type: "input_text", text: SYSTEM }] },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Current time: ${new Date().toISOString()}\n\nActivity log (newest first, "timestamp | action | design | detail"):\n${log}\n\nQuestion: ${data.question}`,
              },
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
    let answer = "";

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
            answer += event.delta;
          } else if (event.type === "response.completed" && !answer) {
            answer = event.response?.output_text ?? "";
          }
        } catch {
          // ignore malformed keep-alive chunks
        }
      }
    }

    return {
      answer:
        answer.trim() ||
        "I couldn't produce an answer for that. Try rephrasing the question about your activity.",
    };
  });
