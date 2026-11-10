import { NextResponse } from "next/server";
import { addPlayer } from "@/lib/game";
import { cleanName, newPlayerId, newToken } from "@/lib/ids";
import { updateGame } from "@/lib/store";
import { handleError } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const name = cleanName(body.name);
    const player = { id: newPlayerId(), name, token: newToken(), hand: [] };
    await updateGame(id.toUpperCase(), (g) => addPlayer(g, player));
    return NextResponse.json({ token: player.token, playerId: player.id });
  } catch (e) {
    return handleError(e);
  }
}
