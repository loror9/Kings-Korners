// Remembers this browser's player token per game so refreshes reconnect you to your seat.
export function saveSeat(gameId: string, token: string) {
  try { localStorage.setItem(`kk:seat:${gameId.toUpperCase()}`, token); } catch {}
}
export function loadSeat(gameId: string): string {
  try { return localStorage.getItem(`kk:seat:${gameId.toUpperCase()}`) || ""; } catch { return ""; }
}
