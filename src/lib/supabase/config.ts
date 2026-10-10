/**
 * Credenciais públicas do projeto Supabase (espelho / backup).
 * Somente URL + anon. Nunca service_role neste módulo.
 */

export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
  "https://wnhytbojvaiamlofkaoe.supabase.co";

export const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduaHl0Ym9qdmFpYW1sb2ZrYW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0Mjc0MzQsImV4cCI6MjEwNjAwMzQzNH0.jC9LCHJ6qBiwy1-dVpYmXhyItzgIp8Z_0a530oc-TOo";

export const SUPABASE_REST = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1`;

export function cabecalhosAnon(): HeadersInit {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}
