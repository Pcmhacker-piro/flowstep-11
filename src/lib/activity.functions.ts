import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

export type ActivityAction =
  | "created"
  | "updated"
  | "renamed"
  | "duplicated"
  | "deleted"
  | "shared"
  | "unshared";

export type ActivityEntry = {
  id: string;
  designId: string | null;
  designName: string;
  action: ActivityAction;
  detail: string | null;
  createdAt: string;
};

type Client = SupabaseClient<Database>;

/**
 * Record one activity entry. Never throws — a history write must not break the
 * action the user actually performed.
 */
export async function recordActivity(
  supabase: Client,
  userId: string,
  entry: {
    designId?: string | null;
    designName: string;
    action: ActivityAction;
    detail?: string | null;
  },
): Promise<void> {
  try {
    await supabase.from("design_activity").insert({
      user_id: userId,
      design_id: entry.designId ?? null,
      design_name: entry.designName,
      action: entry.action,
      detail: entry.detail ?? null,
    });
  } catch {
    // history is best-effort
  }
}

/** The signed-in user's activity history, newest first. */
export const listMyActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActivityEntry[]> => {
    const { data, error } = await context.supabase
      .from("design_activity")
      .select("id, design_id, design_name, action, detail, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id,
      designId: row.design_id,
      designName: row.design_name,
      action: row.action as ActivityAction,
      detail: row.detail,
      createdAt: row.created_at,
    }));
  });

/** Wipe the signed-in user's history. */
export const clearMyActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("design_activity")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
