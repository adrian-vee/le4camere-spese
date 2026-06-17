import type { SupabaseClient } from "@supabase/supabase-js";

export type ActivityAction = "login" | "logout" | "create" | "update" | "delete" | "view" | "export" | "print";
export type ActivityModule = "cassa" | "magazzino" | "inventario" | "housekeeping" | "turni" | "spese" | "documenti" | "utenze" | "staff" | "account" | "auth";

interface LogParams {
  userId: string;
  userName: string;
  action: ActivityAction;
  module: ActivityModule;
  description: string;
  details?: Record<string, unknown>;
}

/** Server-side: fire-and-forget insert */
export function logActivity(supabase: SupabaseClient, params: LogParams) {
  Promise.resolve(
    supabase
      .from("activity_log")
      .insert({
        user_id: params.userId,
        user_name: params.userName,
        action: params.action,
        module: params.module,
        description: params.description,
        details: params.details ?? null,
      })
  ).catch(() => {});
}

/** Client-side: fire-and-forget POST to /api/log */
export function logClientActivity(
  action: ActivityAction,
  module: ActivityModule,
  description: string,
  details?: Record<string, unknown>,
) {
  fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, module, description, details }),
  }).catch(() => {});
}
