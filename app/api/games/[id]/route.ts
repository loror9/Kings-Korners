import { NextResponse } from "next/server";
import { viewFor } from "@/lib/game";
import { loadGame, NotFound } from "@/lib/store";
import { handleError, tokenFrom } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const row = await loadGame(id.toUpperCase());
    if (!row) throw new NotFound();
    const token = tokenFrom(req);
    const me = token ? row.state.players.find((p) => p.token === token) : undefined;
    return NextResponse.json({ ...viewFor(row.state, me?.id ?? null), version: row.version });
  } catch (e) {
    return handleError(e);
  }
}
