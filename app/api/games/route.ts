import { NextResponse } from "next/server";
import { newGame } from "@/lib/game";
import { cleanName, gameCode, newPlayerId, newToken } from "@/lib/ids";
import { createGame } from "@/lib/store";
import { handleError } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = cleanName(body.name);
    const player = { id: newPlayerId(), name, token: newToken(), hand: [] };
    for (let i = 0; i < 5; i++) {
      const id = gameCode();
      if (await createGame(id, newGame(player))) {
        return NextResponse.json({ id, token: player.token, playerId: player.id });
      }
    }
    throw new Error("Could not allocate a game code");
  } catch (e) {
    return handleError(e);
  }
}
