import { test } from "node:test";
import assert from "node:assert/strict";
import { addPlayer, applyAction, newGame, viewFor, type Card, type GameState, type Player } from "./game.ts";

const mkPlayer = (id: string): Player => ({ id, name: id.toUpperCase(), token: `t-${id}`, hand: [] });
const C = (r: number, s: Card["s"]): Card => ({ r, s });

function started(n = 2): GameState {
  const g = newGame(mkPlayer("a"));
  for (let i = 1; i < n; i++) addPlayer(g, mkPlayer(String.fromCharCode(97 + i)));
  applyAction(g, "a", { type: "start" });
  return g;
}

test("deal: 7 cards each, first player draws 1, 4 sides filled, no king on a side", () => {
  for (let k = 0; k < 50; k++) {
    const g = started(4);
    assert.equal(g.players[0].hand.length, 8);
    for (const p of g.players.slice(1)) assert.equal(p.hand.length, 7);
    for (const i of [0, 1, 2, 3]) {
      assert.equal(g.piles[i].length, 1);
      assert.notEqual(g.piles[i][0].r, 13);
    }
    const total = g.deck.length + g.players.reduce((n, p) => n + p.hand.length, 0) + g.piles.flat().length;
    assert.equal(total, 52);
  }
});

test("max 4 players, only host starts, need 2", () => {
  const g = newGame(mkPlayer("a"));
  assert.throws(() => applyAction(g, "a", { type: "start" }), /at least 2/);
  for (const id of ["b", "c", "d"]) addPlayer(g, mkPlayer(id));
  assert.throws(() => addPlayer(g, mkPlayer("e")), /full/);
  assert.throws(() => applyAction(g, "b", { type: "start" }), /host/);
});

test("play rules: alternating color descending, kings only in empty corners", () => {
  const g = started();
  g.piles = [[C(9, "S")], [], [], [], [], [], [], []];
  const a = g.players[0];
  a.hand = [C(8, "S"), C(8, "H"), C(13, "D"), C(5, "C"), C(2, "C")];
  assert.throws(() => applyAction(g, "a", { type: "play", cardIndex: 0, pile: 0 }), /fit/);
  applyAction(g, "a", { type: "play", cardIndex: 1, pile: 0 }); // red 8 on black 9
  // hand now [8S, KD, 5C, 2C]
  assert.throws(() => applyAction(g, "a", { type: "play", cardIndex: 2, pile: 4 }), /Only Kings/); // 5C into corner
  applyAction(g, "a", { type: "play", cardIndex: 1, pile: 4 }); // KD into corner
  applyAction(g, "a", { type: "play", cardIndex: 0, pile: 2 }); // anything fills an empty side
  assert.deepEqual(g.players[0].hand, [C(5, "C"), C(2, "C")]);
  assert.throws(() => applyAction(g, "b", { type: "endTurn" }), /Not your turn/);
});

test("move pile onto fitting pile and King pile into corner", () => {
  const g = started();
  g.piles = [[C(7, "H"), C(6, "S")], [C(8, "C")], [C(13, "S"), C(12, "H")], [], [], [], [], []];
  applyAction(g, "a", { type: "movePile", from: 0, to: 1 });
  assert.deepEqual(g.piles[1], [C(8, "C"), C(7, "H"), C(6, "S")]);
  assert.equal(g.piles[0].length, 0);
  assert.throws(() => applyAction(g, "a", { type: "movePile", from: 1, to: 4 }), /can't move/);
  applyAction(g, "a", { type: "movePile", from: 2, to: 5 });
  assert.equal(g.piles[5].length, 2);
});

test("emptying hand wins; view hides other hands", () => {
  const g = started();
  g.piles = [[C(9, "S")], [], [], [], [], [], [], []];
  g.players[0].hand = [C(8, "D")];
  applyAction(g, "a", { type: "play", cardIndex: 0, pile: 0 });
  assert.equal(g.phase, "finished");
  assert.deepEqual(g.winnerIds, ["a"]);
  const v = viewFor(g, "b");
  assert.equal(v.me?.id, "b");
  assert.ok(!JSON.stringify(v).includes("t-a"));
  assert.equal((v as any).deck, undefined);
  applyAction(g, "a", { type: "rematch" });
  assert.equal(g.phase, "playing");
  assert.equal(g.turn, 1); // first player rotates
});

test("stalemate when deck empty and a full round passes with no plays", () => {
  const g = started();
  g.deck = [];
  g.players[0].hand = [C(13, "S"), C(2, "H")]; // 11 points
  g.players[1].hand = [C(3, "S"), C(4, "H"), C(5, "H")]; // 3 points
  applyAction(g, "a", { type: "endTurn" });
  assert.equal(g.phase, "playing");
  applyAction(g, "b", { type: "endTurn" });
  assert.equal(g.phase, "finished");
  assert.deepEqual(g.winnerIds, ["b"]);
});
