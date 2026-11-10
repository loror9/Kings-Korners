"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { cardLabel, isRed, MAX_PLAYERS, MIN_PLAYERS, type Action, type Card, type PublicView } from "@/lib/game";
import { loadSeat, saveSeat } from "@/lib/seat";
import { supabase } from "@/lib/supabaseClient";

type View = PublicView & { version?: number };
type Sel = { kind: "card"; index: number } | { kind: "pile"; pile: number } | null;

const SUIT = { S: "♠", H: "♥", D: "♦", C: "♣" } as const;
const RANK = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// Board positions in a 3x3 grid. "deck" is the middle.
const GRID: (number | "deck")[] = [7, 0, 4, 3, "deck", 1, 6, 2, 5];

function CardFace({ c, className = "", onClick }: { c: Card; className?: string; onClick?: () => void }) {
  const label = `${RANK[c.r]}${SUIT[c.s]}`;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`card ${isRed(c) ? "red" : ""} ${className}`} onClick={onClick} aria-label={cardLabel(c)}>
      <span className="corner-tl">{RANK[c.r]}<br />{SUIT[c.s]}</span>
      <span className="pip">{c.r >= 11 ? RANK[c.r] : SUIT[c.s]}</span>
      <span className="corner-br">{RANK[c.r]}<br />{SUIT[c.s]}</span>
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{label}</span>
    </Tag>
  );
}

/**
 * A pile drawn as a downward fan so every card shows. The first gap is always wide enough
 * to read the bottom card's rank; middle gaps shrink to fit; the top card is fully visible.
 */
function PileFan({ pile }: { pile: Card[] }) {
  const n = pile.length;
  // Offsets in units of card height. Total fan space below the first card = FAN.
  const FAN = 0.62, PEEK = 0.24;
  const offsets: number[] = [0];
  if (n >= 2) {
    const rest = n - 2;
    const gap = rest > 0 ? Math.min(PEEK, (FAN - PEEK) / rest) : 0;
    for (let i = 1; i < n; i++) offsets.push(i === 1 ? PEEK : PEEK + gap * (i - 1));
  }
  return (
    <div className="fan">
      {pile.map((c, i) => (
        <div key={i} className="fan-card" style={{ top: `calc(var(--card-h) * ${offsets[i]})`, zIndex: i }}>
          <CardFace c={c} />
        </div>
      ))}
      {n > 1 && <span className="pile-count">{n}</span>}
    </div>
  );
}

export default function GamePage() {
  const params = useParams<{ id: string }>();
  const id = (params.id || "").toUpperCase();
  const [token, setToken] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState("");
  const [sel, setSel] = useState<Sel>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const tokenRef = useRef("");
  const lastVersion = useRef(-1);

  const showToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? "" : t)), 2800);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${id}`, { headers: { "x-player-token": tokenRef.current }, cache: "no-store" });
      if (res.status === 404) return setNotFound(true);
      if (!res.ok) return;
      const data = (await res.json()) as View;
      if (typeof data.version === "number") {
        if (data.version < lastVersion.current) return; // stale response
        lastVersion.current = data.version;
      }
      setView(data);
    } catch {}
  }, [id]);

  // Load seat + name, then first fetch.
  useEffect(() => {
    const t = loadSeat(id);
    tokenRef.current = t;
    setToken(t);
    try { setName(localStorage.getItem("kk:name") || ""); } catch {}
    refresh();
  }, [id, refresh]);

  // Live updates via Supabase Realtime, plus a slow poll as a safety net.
  useEffect(() => {
    const sb = supabase();
    const ch = sb
      ?.channel(`game-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_pings", filter: `game_id=eq.${id}` }, () => refresh())
      .subscribe();
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 5000);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (sb && ch) sb.removeChannel(ch);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [id, refresh]);

  async function act(action: Action) {
    setBusy(true);
    try {
      const res = await fetch(`/api/games/${id}/action`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-player-token": tokenRef.current },
        body: JSON.stringify(action),
      });
      const data = await res.json();
      if (!res.ok) showToast(data.error || "Move not allowed");
      else setView((v) => ({ ...data, version: v?.version }));
    } catch {
      showToast("Connection problem, try again");
    } finally {
      setSel(null);
      setBusy(false);
      refresh();
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return showToast("Enter your name");
    setBusy(true);
    try {
      try { localStorage.setItem("kk:name", name.trim()); } catch {}
      const res = await fetch(`/api/games/${id}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not join");
      saveSeat(id, data.token);
      tokenRef.current = data.token;
      setToken(data.token);
      await refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/g/${id}` : `/g/${id}`;
  async function share() {
    try {
      if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
        await navigator.share({ title: "Kings Korners", text: "Join my Kings Korners game!", url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const me = view?.me ?? null;
  const myTurn = !!view && !!me && view.phase === "playing" && view.turnPlayerId === me.id;
  const canDraw = myTurn && !busy && !!view && !view.drewThisTurn && view.deckCount > 0;

  // Sorted hand for display, keeping the original index the server needs.
  const hand = useMemo(() => {
    if (!me) return [];
    return me.hand
      .map((c, index) => ({ c, index }))
      .sort((a, b) => b.c.r - a.c.r || a.c.s.localeCompare(b.c.s));
  }, [me]);

  // No move hints: tapping a target just attempts the move and the server says if it's illegal.
  function onPile(i: number) {
    if (!view || !myTurn || busy) return;
    if (sel?.kind === "card") return act({ type: "play", cardIndex: sel.index, pile: i });
    if (sel?.kind === "pile") {
      if (sel.pile === i) return setSel(null);
      return act({ type: "movePile", from: sel.pile, to: i });
    }
    if (i < 4 && view.piles[i].length) setSel({ kind: "pile", pile: i });
  }

  function onHandCard(index: number) {
    if (!myTurn || busy) return;
    setSel((s) => (s?.kind === "card" && s.index === index ? null : { kind: "card", index }));
  }

  // ---------- Render ----------
  if (notFound) {
    return (
      <main className="wrap center">
        <h1>Game not found</h1>
        <p className="sub">The code <b>{id}</b> doesn't exist or has expired.</p>
        <Link className="btn" href="/">Back home</Link>
      </main>
    );
  }
  if (!view) {
    return <main className="wrap center"><p className="sub">Loading game {id}…</p></main>;
  }

  const isHost = me?.id === view.hostId;
  const nameOf = (pid: string | null) => view.players.find((p) => p.id === pid)?.name ?? "";

  // Lobby
  if (view.phase === "lobby") {
    return (
      <main className="wrap center">
        <h1 className="title" style={{ fontSize: 32 }}>Kings <span>♛</span> Korners</h1>
        <div className="panel stack">
          <div className="sub">Game code</div>
          <div className="code-big">{id}</div>
          <div className="share">
            <code>{shareUrl}</code>
            <button className="btn small" onClick={share}>{copied ? "Copied!" : "Share link"}</button>
          </div>
        </div>

        <div className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b>Players</b>
            <span className="sub">{view.players.length}/{MAX_PLAYERS}</span>
          </div>
          <ul className="players">
            {view.players.map((p) => (
              <li key={p.id}>
                <span>{p.name}{p.id === me?.id ? " (you)" : ""}</span>
                <span>{p.id === view.hostId ? "👑 host" : ""}</span>
              </li>
            ))}
          </ul>

          {!me && view.players.length < MAX_PLAYERS && (
            <form className="stack" onSubmit={join}>
              <input type="text" placeholder="Your name" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn wide" disabled={busy}>{busy ? "Joining…" : "Join game"}</button>
            </form>
          )}
          {!me && view.players.length >= MAX_PLAYERS && <p className="err">This game is full.</p>}

          {isHost && (
            <button className="btn wide" disabled={busy || view.players.length < MIN_PLAYERS} onClick={() => act({ type: "start" })}>
              {view.players.length < MIN_PLAYERS ? "Waiting for players…" : `Start game (${view.players.length} players)`}
            </button>
          )}
          {me && !isHost && <p className="sub">Waiting for {nameOf(view.hostId)} to start…</p>}
        </div>
        {toast && <div className="toast">{toast}</div>}
      </main>
    );
  }

  // Playing / finished
  let status: React.ReactNode = null;
  if (view.phase === "playing") {
    if (myTurn) {
      status = sel?.kind === "card"
        ? <>Tap a pile to play <b>{cardLabel(me!.hand[sel.index])}</b> (tap the card again to cancel)</>
        : sel?.kind === "pile"
          ? <>Tap a pile to move this one onto it (tap it again to cancel)</>
          : <><b>Your turn.</b> Play cards, move a pile, or draw (optional).</>;
    } else {
      status = <>Waiting for <b>{nameOf(view.turnPlayerId)}</b>…</>;
    }
  }

  return (
    <main className="wrap">
      <div className="topbar">
        <h1><Link href="/" style={{ color: "inherit", textDecoration: "none" }}>Kings <span style={{ color: "var(--gold)" }}>♛</span> Korners</Link></h1>
        <button className="btn ghost small" onClick={share}>{copied ? "Copied!" : `Code ${id}`}</button>
      </div>

      <div className="seats">
        {view.players.map((p) => (
          <div key={p.id} className={`seat ${p.id === view.turnPlayerId ? "turn" : ""} ${p.id === me?.id ? "me" : ""}`}>
            {p.id === view.hostId ? "👑 " : ""}{p.name}{p.id === me?.id ? " (you)" : ""}
            <span className="n">🂠 {p.cardCount}</span>
          </div>
        ))}
      </div>

      {view.phase === "finished" && (
        <div className="banner">
          <h2>🏆 {view.winnerIds.map(nameOf).join(" & ")} {view.winnerIds.length > 1 ? "win" : "wins"}!</h2>
          <div className="sub">
            Cards left (penalty points): {view.players.map((p) => `${p.name} ${p.penalty ?? 0}`).join(" · ")}
          </div>
          {isHost ? (
            <button className="btn" style={{ marginTop: 10 }} disabled={busy} onClick={() => act({ type: "rematch" })}>Play again</button>
          ) : (
            <p className="sub" style={{ marginTop: 8 }}>Waiting for the host to start a new round…</p>
          )}
        </div>
      )}

      <div className="board">
        {GRID.map((g) => {
          if (g === "deck") {
            return (
              <div key="deck" className="deck-cell">
                <button
                  className={`deck ${view.deckCount ? "" : "empty"} ${canDraw ? "drawable" : ""}`}
                  onClick={() => canDraw && act({ type: "draw" })}
                  disabled={!canDraw}
                  aria-label={canDraw ? "Draw a card" : `Deck, ${view.deckCount} cards`}
                >
                  {view.deckCount ? view.deckCount : "empty"}
                </button>
                {canDraw && <span className="deck-hint">tap to draw</span>}
              </div>
            );
          }
          const pile = view.piles[g];
          const corner = g >= 4;
          const complete = pile.length === 13; // full run K down to A
          const isSel = sel?.kind === "pile" && sel.pile === g;
          const top = pile[pile.length - 1];
          return (
            <button
              key={g}
              className={`slot ${corner ? "corner" : ""} ${pile.length ? "filled" : ""} ${complete ? "complete" : ""} ${isSel ? "selected" : ""}`}
              onClick={() => onPile(g)}
              aria-label={`${corner ? "Corner" : "Side"} pile${top ? `, ${cardLabel(pile[0])} to ${cardLabel(top)}, ${pile.length} cards` : ", empty"}`}
            >
              {top ? <PileFan pile={pile} /> : <span className="empty-slot">{corner ? "K" : ""}</span>}
              {complete && <span className="complete-badge">✓ FULL</span>}
            </button>
          );
        })}
      </div>

      <p className="status">{status}</p>

      {me ? (
        <div className="hand-area">
          <div className="hand-head">
            <b>Your hand ({me.hand.length})</b>
            {view.phase === "playing" && (
              <div className="row">
                <button className="btn ghost small" disabled={!canDraw} onClick={() => act({ type: "draw" })}>
                  {view.drewThisTurn && myTurn ? "Drew ✓" : "Draw (optional)"}
                </button>
                <button className="btn small" disabled={!myTurn || busy} onClick={() => act({ type: "endTurn" })}>
                  End turn
                </button>
              </div>
            )}
          </div>
          <div className={`hand ${myTurn ? "" : "disabled"}`}>
            {hand.map(({ c, index }) => (
              <CardFace
                key={`${c.r}${c.s}`}
                c={c}
                onClick={() => onHandCard(index)}
                className={`${sel?.kind === "card" && sel.index === index ? "sel" : ""}`}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="sub" style={{ textAlign: "center" }}>You're watching. This game already started.</p>
      )}

      <div className="log">
        {view.log.slice().reverse().map((l, i) => <div key={i}>{l}</div>)}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
