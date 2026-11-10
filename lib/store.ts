import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { GameState } from "./game";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const secret = process.env.KK_SERVER_SECRET!;

const db = () => createClient(url, anon, { auth: { persistSession: false } });

// Local dev fallback: with no Supabase config, keep games in memory (single process only).
const memory = !secret || !url;
type Row = { state: GameState; version: number };
const mem: Map<string, Row> = ((globalThis as any).__kkMem ??= new Map());
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export async function loadGame(id: string): Promise<{ state: GameState; version: number } | null> {
  if (memory) { const r = mem.get(id); return r ? clone(r) : null; }
  const { data, error } = await db().rpc("kk_get", { p_secret: secret, p_id: id });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { state: row.state as GameState, version: row.version as number } : null;
}

export async function createGame(id: string, state: GameState): Promise<boolean> {
  if (memory) { if (mem.has(id)) return false; mem.set(id, { state: clone(state), version: 1 }); return true; }
  const { data, error } = await db().rpc("kk_create", { p_secret: secret, p_id: id, p_state: state });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function saveGame(id: string, state: GameState, version: number): Promise<boolean> {
  if (memory) {
    const r = mem.get(id);
    if (!r || r.version !== version) return false;
    mem.set(id, { state: clone(state), version: version + 1 });
    return true;
  }
  const { data, error } = await db().rpc("kk_save", { p_secret: secret, p_id: id, p_state: state, p_version: version });
  if (error) throw new Error(error.message);
  return data === true;
}

/** Load, mutate, save with optimistic concurrency; retries on conflicts. */
export async function updateGame<T>(id: string, fn: (g: GameState) => T): Promise<{ state: GameState; result: T }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await loadGame(id);
    if (!row) throw new NotFound();
    const result = fn(row.state);
    if (await saveGame(id, row.state, row.version)) return { state: row.state, result };
  }
  throw new Error("Too many simultaneous updates, try again");
}

export class NotFound extends Error {}
