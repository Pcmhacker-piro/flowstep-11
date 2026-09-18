import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

export type SavedDesignSummary = {
  id: string;
  name: string;
  prompt: string;
  model: string | null;
  screenCount: number;
  isPublic: boolean;
  shareToken: string | null;
  thumbnailHtml: string | null;
  updatedAt: string;
};

/** A canvas item as stored in JSONB — plain JSON, shape owned by the canvas. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StoredCanvasItem = Record<string, any>;

export type SavedDesign = SavedDesignSummary & {
  items: StoredCanvasItem[];
};

const SUMMARY_COLUMNS =
  "id, name, prompt, model, screen_count, is_public, share_token, thumbnail_html, updated_at";

function toSummary(row: {
  id: string;
  name: string;
  prompt: string;
  model: string | null;
  screen_count: number;
  is_public: boolean;
  share_token: string | null;
  thumbnail_html: string | null;
  updated_at: string;
}): SavedDesignSummary {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    model: row.model,
    screenCount: row.screen_count,
    isPublic: row.is_public,
    shareToken: row.share_token,
    thumbnailHtml: row.thumbnail_html,
    updatedAt: row.updated_at,
  };
}

const saveSchema = z.object({
  id: z.string().uuid().nullish(),
  name: z.string().trim().min(1).max(120),
  prompt: z.string().max(8000).default(""),
  model: z.string().max(120).nullish(),
  items: z.array(z.unknown()).max(40),
});

/** Create or update a design in the signed-in user's library. */
export const saveMyDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const screens = data.items.filter(
      (item): item is { type: string; html?: string } =>
        typeof item === "object" && item !== null && (item as { type?: string }).type === "design",
    );
    const payload = {
      user_id: context.userId,
      name: data.name,
      prompt: data.prompt,
      model: data.model ?? null,
      items: data.items as never,
      screen_count: screens.length,
      thumbnail_html: screens[0]?.html ?? null,
    };

    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("designs")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select(SUMMARY_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return toSummary(row);
    }

    const { data: row, error } = await context.supabase
      .from("designs")
      .insert(payload)
      .select(SUMMARY_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return toSummary(row);
  });

/** All designs in the signed-in user's library, newest first. */
export const listMyDesigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("designs")
      .select(SUMMARY_COLUMNS)
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toSummary);
  });

/** One of the user's designs, including the full canvas payload. */
export const getMyDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<SavedDesign | null> => {
    const { data: row, error } = await context.supabase
      .from("designs")
      .select(`${SUMMARY_COLUMNS}, items`)
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return { ...toSummary(row), items: (row.items as StoredCanvasItem[]) ?? [] };
  });

export const renameMyDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("designs")
      .update({ name: data.name })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMyDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("designs")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Duplicate a design into a fresh library entry (new share token, private). */
export const duplicateMyDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("designs")
      .select("name, prompt, model, items, screen_count, thumbnail_html")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (error) throw new Error(error.message);
    const { data: copy, error: insertError } = await context.supabase
      .from("designs")
      .insert({
        user_id: context.userId,
        name: `${row.name} copy`,
        prompt: row.prompt,
        model: row.model,
        items: row.items,
        screen_count: row.screen_count,
        thumbnail_html: row.thumbnail_html,
      })
      .select(SUMMARY_COLUMNS)
      .single();
    if (insertError) throw new Error(insertError.message);
    return toSummary(copy);
  });

/** Turn the public share link on or off. */
export const setMyDesignSharing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), isPublic: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("designs")
      .update({ is_public: data.isPublic })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select(SUMMARY_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return toSummary(row);
  });

/** Public read of a shared design — no session required. */
export const getSharedDesign = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(8).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const url = process.env["SUPABASE_URL"]!;
    const supabasePublic = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });

    const { data: row, error } = await supabasePublic
      .from("designs")
      .select("id, name, prompt, items, screen_count, updated_at")
      .eq("share_token", data.token)
      .eq("is_public", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      prompt: row.prompt,
      screenCount: row.screen_count,
      updatedAt: row.updated_at,
      items: (row.items as StoredCanvasItem[]) ?? [],
    };
  });
