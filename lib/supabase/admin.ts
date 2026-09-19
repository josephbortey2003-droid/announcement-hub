import "server-only";

import { createClient } from "@supabase/supabase-js";
import { requirePublicSupabaseConfig } from "./config";

export function createAdminClient() {
  const { url } = requirePublicSupabaseConfig();
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey) {
    throw new Error("The server-side Supabase secret key is not configured.");
  }

  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
