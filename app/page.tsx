"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSeat } from "@/lib/seat";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    try { setName(localStorage.getItem("kk:name") || ""); } catch {}
  }, []);

  async function create() {
    setErr("");
    if (!name.trim()) return setErr("Enter your name first");
    setBusy(true);
    try {
      try { localStorage.setItem("kk:name", name.trim()); } catch {}
      const res = await fetch("/api/games", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create game");
      saveSeat(data.id, data.token);
      router.push(`/g/${data.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length < 4) return setErr("Enter a game code");
    router.push(`/g/${c}`);
  }

  return (
    <main className="wrap center">
      <h1 className="title">
        Kings <span>♛</span> Korners
      </h1>
      <p className="sub">Online card game for 2–4 players. Create a game and send the link.</p>

      <div className="panel stack">
        <input type="text" placeholder="Your name" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        <button className="btn wide" onClick={create} disabled={busy}>
          {busy ? "Creating…" : "Create game"}
        </button>
        <p className="err">{err}</p>
      </div>

      <form className="panel stack" onSubmit={join}>
        <div className="row">
          <input type="text" placeholder="Have a code? e.g. K7Q2XM" value={code} onChange={(e) => setCode(e.target.value)} style={{ flex: 1, minWidth: 0, width: "auto" }} />
          <button className="btn ghost" type="submit">Join</button>
        </div>
      </form>

      <details className="panel">
        <summary style={{ cursor: "pointer" }}>How to play</summary>
        <ul className="rules">
          <li>Everyone gets 7 cards. Four cards go face up on the sides of the deck (N, E, S, W).</li>
          <li>On your turn you may draw one card (optional), and play as many cards as you like.</li>
          <li>Build piles downward in alternating colors: a red 6 on a black 7.</li>
          <li>Kings can only start a pile in one of the four corners.</li>
          <li>You can move a whole pile onto another if its bottom card fits.</li>
          <li>Any card can fill an empty side space.</li>
          <li>First to empty their hand wins. If the deck runs out and nobody can play, the lowest hand wins (K = 10, others = 1).</li>
        </ul>
      </details>
    </main>
  );
}
