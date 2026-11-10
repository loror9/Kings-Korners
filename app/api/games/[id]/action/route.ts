import { NextResponse } from "next/server";
import { applyAction, GameError, viewFor, type Action } from "@/lib/game";
import { updateGame } from "@/lib/store";
import { handleError, tokenFrom } from "@/lib/http";

const TYPES = new Set(["start", "play", "movePile", "endTurn", "rematch"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const action = (await req.json().catch(() => null)) as Action | null;
    if (!action || !TYPES.has(action.type)) throw new GameError("Bad action");
    const token = tokenFrom(req);
    const { state } = await updateGame(id.toUpperCase(), (g) => {
      const me = g.players.find((p) => p.token === token);
      if (!token || !me) throw new GameError("You are not in this game");
      applyAction(g, me.id, action);
      return me.id;
    });
    const me = state.players.find((p) => p.token === token)!;
    return NextResponse.json(viewFor(state, me.id));
  } catch (e) {
    return handleError(e);
  }
}
