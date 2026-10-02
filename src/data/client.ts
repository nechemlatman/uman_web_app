import { createClient } from "@supabase/supabase-js";
export function validPublicConfig(url?: string, key?: string): boolean {
  if (!url || !key) return false;
  try {
    const u = new URL(url);
    if (
      u.protocol !== "https:" &&
      u.hostname !== "127.0.0.1" &&
      u.hostname !== "localhost"
    )
      return false;
  } catch {
    return false;
  }
  if (key.startsWith("sb_secret_")) return false;
  if (key.startsWith("eyJ")) {
    try {
      const body = JSON.parse(
        atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (body.role !== "anon") return false;
    } catch {
      return false;
    }
  }
  return key.startsWith("sb_publishable_") || key.startsWith("eyJ");
}
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = validPublicConfig(url, key);
export const client = configured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
export function backend() {
  if (!client) throw new Error("configuration");
  return client;
}
