import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { requirePublicSupabaseConfig } from "./config";

export function createClient() {
  const { url, publishableKey } = requirePublicSupabaseConfig();
  return createBrowserClient<Database>(url, publishableKey);
}
