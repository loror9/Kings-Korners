# Kings Korners

Online multiplayer Kings Corners for 2–4 players in the browser. Create a game, share the link, play.

- **Next.js** (App Router) on **Vercel** — UI and API routes. The server validates every move and never sends other players' hands.
- **Supabase** — Postgres stores game state (via secret-gated RPC functions); Realtime pushes "game changed" pings so everyone updates instantly. Clients also poll every 5s as a fallback.

## Rules implemented
- 7 cards each; 4 cards face up on the sides. Kings dealt to a side move to a corner.
- Draw 1 at the start of your turn, then play as many cards as you like.
- Build down in alternating colors. Kings only start in empty corners; any card fills an empty side.
- Move a whole side pile onto another pile when its bottom card fits (or a King-based pile into an empty corner).
- First to empty their hand wins. If the deck is empty and nobody plays for a full round, lowest penalty (K=10, others=1) wins.

## Develop
```bash
npm install
npm test        # rules engine tests
npm run dev     # without env vars, games are kept in memory
```

Env vars (see Vercel project): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `KK_SERVER_SECRET` (must match `kk_config.server_secret` in the database).

Database schema: `supabase/migrations/`.
