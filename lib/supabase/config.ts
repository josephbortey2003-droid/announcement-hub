export type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

export function getPublicSupabaseConfig(): PublicSupabaseConfig | null {
  const environment = typeof process === "undefined" ? undefined : process.env;
  const url = environment?.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = environment?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export function requirePublicSupabaseConfig(): PublicSupabaseConfig {
  const config = getPublicSupabaseConfig();
  if (!config) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and add the project URL and publishable key."
    );
  }
  return config;
}
