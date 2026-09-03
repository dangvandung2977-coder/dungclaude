import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { config } from "@/lib/config";

/**
 * Creates a server-side Supabase client using the cookie jar.
 * Reads and writes PKCE code verifier and auth tokens.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const url = config.supabase.url || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = config.supabase.publishableKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Can happen if called from a Server Component instead of Route Handler/Server Action
        }
      },
    },
  });
}
