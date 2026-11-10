// Pure Kings Corners rules engine. No I/O; used by the API routes.

export type Suit = "S" | "H" | "D" | "C";
export type Card = { r: number; s: Suit }; // r: 1 (Ace) .. 13 (King)

export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;
export const HAND_SIZE = 7;

// Piles 0-3 are the sides (N, E, S, W); 4-7 are the corners (NE, SE, SW, NW).
export const SIDE_PILES = [0, 1, 2, 3];
export const CORNER_PILES = [4, 5, 6, 7];
export const PILE_NAMES = ["North", "East", "South", "West", "NE corner", "SE corner", "SW corner", "NW corner"];

export type Player = { id: string; name: string; token: string; hand: Card[] };

export type GameState = {
  phase: "lobby" | "playing" | "finished";
  players: Player[];
  hostId: string;
  deck: Card[];
  piles: Card[][];
  turn: number; // index into players
  playedThisTurn: boolean;
  drewThisTurn?: boolean; // drawing is optional, max 1 per turn
  idleTurns: number; // consecutive turns with no play while the deck is empty
  winnerIds: string[];
  log: string[];
  round: number;
};

export type Action =
  | { type: "start" }
  | { type: "play"; cardIndex: number; pile: number }
  | { type: "movePile"; from: number; to: number }
  | { type: "draw" }
  | { type: "endTurn" }
  | { type: "rematch" };

export class GameError extends Error {}

const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUIT_SYMBOLS: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

export const cardLabel = (c: Card) => `${RANKS[c.r]}${SUIT_SYMBOLS[c.s]}`;
export const isRed = (c: Card) => c.s === "H" || c.s === "D";
const isCorner = (pile: number) => pile >= 4;

/** Can `card` be placed on top of `target`? (one rank lower, opposite color) */
export const fitsOn = (card: Card, target: Card) => card.r === target.r - 1 && isRed(card) !== isRed(target);

export function newDeck(rand: () => number = Math.random): Card[] {
  const deck: Card[] = [];
  for (const s of ["S", "H", "D", "C"] as Suit[]) for (let r = 1; r <= 13; r++) deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function newGame(host: Player): GameState {
  return {
    phase: "lobby",
    players: [host],
    hostId: host.id,
    deck: [],
    piles: [[], [], [], [], [], [], [], []],
    turn: 0,
    playedThisTurn: false,
    drewThisTurn: false,
    idleTurns: 0,
    winnerIds: [],
    log: [`${host.name} created the game`],
    round: 0,
  };
}

export function addPlayer(g: GameState, p: Player) {
  if (g.phase !== "lobby") throw new GameError("Game already started");
  if (g.players.length >= MAX_PLAYERS) throw new GameError("Game is full");
  g.players.push(p);
  pushLog(g, `${p.name} joined`);
}

function pushLog(g: GameState, msg: string) {
  g.log.push(msg);
  if (g.log.length > 30) g.log.splice(0, g.log.length - 30);
}

function canPlace(card: Card, pile: Card[], pileIdx: number): boolean {
  if (pile.length === 0) return isCorner(pileIdx) ? card.r === 13 : true;
  return fitsOn(card, pile[pile.length - 1]);
}

function canMovePile(piles: Card[][], from: number, to: number): boolean {
  if (from === to) return false;
  const src = piles[from];
  const dst = piles[to];
  if (!src.length || isCorner(from)) return false; // corner piles are permanent
  if (dst.length === 0) return isCorner(to) && src[0].r === 13;
  return fitsOn(src[0], dst[dst.length - 1]);
}

function startRound(g: GameState, rand: () => number) {
  g.deck = newDeck(rand);
  g.piles = [[], [], [], [], [], [], [], []];
  for (const p of g.players) p.hand = g.deck.splice(0, HAND_SIZE);
  for (const i of SIDE_PILES) g.piles[i].push(g.deck.shift()!);
  // A King dealt to a side moves to a corner, and the side is refilled.
  let corner = 4;
  for (const i of SIDE_PILES) {
    while (g.piles[i].length && g.piles[i][0].r === 13) {
      g.piles[corner++].push(g.piles[i].pop()!);
      if (g.deck.length) g.piles[i].push(g.deck.shift()!);
    }
  }
  g.phase = "playing";
  g.winnerIds = [];
  g.idleTurns = 0;
  g.round += 1;
  // Rotate who goes first each round.
  g.turn = (g.round - 1) % g.players.length;
  pushLog(g, `Round ${g.round} started`);
  beginTurn(g);
}

function beginTurn(g: GameState) {
  g.playedThisTurn = false;
  g.drewThisTurn = false;
  pushLog(g, `${g.players[g.turn].name}'s turn`);
}

function checkWin(g: GameState, p: Player) {
  if (p.hand.length === 0) {
    g.phase = "finished";
    g.winnerIds = [p.id];
    pushLog(g, `🏆 ${p.name} wins!`);
  }
}

/** Score = penalty points left in hand: Kings 10, everything else 1. */
export const handPenalty = (hand: Card[]) => hand.reduce((n, c) => n + (c.r === 13 ? 10 : 1), 0);

export function applyAction(g: GameState, playerId: string, a: Action, rand: () => number = Math.random) {
  const me = g.players.find((p) => p.id === playerId);
  if (!me) throw new GameError("You are not in this game");

  if (a.type === "start" || a.type === "rematch") {
    if (playerId !== g.hostId) throw new GameError("Only the host can start");
    if (a.type === "start" && g.phase !== "lobby") throw new GameError("Already started");
    if (a.type === "rematch" && g.phase !== "finished") throw new GameError("Game is not over");
    if (g.players.length < MIN_PLAYERS) throw new GameError(`Need at least ${MIN_PLAYERS} players`);
    startRound(g, rand);
    return;
  }

  if (g.phase !== "playing") throw new GameError("Game is not in progress");
  if (g.players[g.turn].id !== playerId) throw new GameError("Not your turn");

  switch (a.type) {
    case "play": {
      const card = me.hand[a.cardIndex];
      if (!card) throw new GameError("Invalid card");
      if (!(a.pile >= 0 && a.pile < 8)) throw new GameError("Invalid pile");
      if (!canPlace(card, g.piles[a.pile], a.pile)) {
        throw new GameError(
          isCorner(a.pile) && !g.piles[a.pile].length ? "Only Kings go in empty corners" : "That card doesn't fit there",
        );
      }
      me.hand.splice(a.cardIndex, 1);
      g.piles[a.pile].push(card);
      g.playedThisTurn = true;
      pushLog(g, `${me.name} played ${cardLabel(card)} on ${PILE_NAMES[a.pile]}`);
      checkWin(g, me);
      return;
    }
    case "movePile": {
      if (!(a.from >= 0 && a.from < 8 && a.to >= 0 && a.to < 8)) throw new GameError("Invalid pile");
      if (!canMovePile(g.piles, a.from, a.to)) throw new GameError("That pile can't move there");
      const moved = g.piles[a.from];
      g.piles[a.to].push(...moved);
      g.piles[a.from] = [];
      g.playedThisTurn = true;
      pushLog(g, `${me.name} moved ${PILE_NAMES[a.from]} onto ${PILE_NAMES[a.to]}`);
      return;
    }
    case "draw": {
      if (g.drewThisTurn) throw new GameError("You already drew this turn");
      if (!g.deck.length) throw new GameError("The deck is empty");
      me.hand.push(g.deck.shift()!);
      g.drewThisTurn = true;
      pushLog(g, `${me.name} drew a card`);
      return;
    }
    case "endTurn": {
      if (g.deck.length === 0) {
        g.idleTurns = g.playedThisTurn ? 0 : g.idleTurns + 1;
        if (g.idleTurns >= g.players.length) {
          // Stalemate: nobody can play and the deck is gone. Fewest penalty points wins.
          const best = Math.min(...g.players.map((p) => handPenalty(p.hand)));
          g.winnerIds = g.players.filter((p) => handPenalty(p.hand) === best).map((p) => p.id);
          g.phase = "finished";
          const names = g.players.filter((p) => g.winnerIds.includes(p.id)).map((p) => p.name);
          pushLog(g, `Deck empty and nobody can play. 🏆 ${names.join(" & ")} win${names.length > 1 ? "" : "s"}!`);
          return;
        }
      }
      g.turn = (g.turn + 1) % g.players.length;
      beginTurn(g);
      return;
    }
  }
}

/** Legal targets for the client to highlight (also used by tests). */
export function legalPlayTargets(piles: Card[][], card: Card): number[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => canPlace(card, piles[i], i));
}
export function legalMoveTargets(piles: Card[][], from: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => canMovePile(piles, from, i));
}

export type PublicView = {
  phase: GameState["phase"];
  players: { id: string; name: string; cardCount: number; penalty: number | null }[];
  hostId: string;
  deckCount: number;
  piles: Card[][];
  turnPlayerId: string | null;
  playedThisTurn: boolean;
  drewThisTurn: boolean;
  winnerIds: string[];
  log: string[];
  round: number;
  me: { id: string; hand: Card[] } | null;
};

/** What a given viewer is allowed to see. Other players' hands and the deck stay hidden. */
export function viewFor(g: GameState, playerId: string | null): PublicView {
  const me = g.players.find((p) => p.id === playerId) ?? null;
  return {
    phase: g.phase,
    players: g.players.map((p) => ({
      id: p.id,
      name: p.name,
      cardCount: p.hand.length,
      penalty: g.phase === "finished" ? handPenalty(p.hand) : null,
    })),
    hostId: g.hostId,
    deckCount: g.deck.length,
    piles: g.piles,
    turnPlayerId: g.phase === "playing" ? g.players[g.turn].id : null,
    playedThisTurn: g.playedThisTurn,
    drewThisTurn: !!g.drewThisTurn,
    winnerIds: g.winnerIds,
    log: g.log.slice(-12),
    round: g.round,
    me: me ? { id: me.id, hand: me.hand } : null,
  };
}
