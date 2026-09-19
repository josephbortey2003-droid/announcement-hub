import { createBrowserClient } from "@supabase/ssr";
import { requirePublicSupabaseConfig } from "./config";

export function createClient() {
  const { url, publishableKey } = requirePublicSupabaseConfig();
  return createBrowserClient(url, publishableKey);
}
