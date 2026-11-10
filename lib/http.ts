import { NextResponse } from "next/server";
import { GameError } from "./game";
import { NotFound } from "./store";

export function handleError(e: unknown) {
  if (e instanceof NotFound) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: 400 });
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "Please enter a name") return NextResponse.json({ error: msg }, { status: 400 });
  console.error(e);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

export const tokenFrom = (req: Request) => req.headers.get("x-player-token") || "";
