import { randomBytes, randomUUID } from "node:crypto";

// No 0/O/1/I to keep codes easy to read aloud.
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function gameCode(len = 6) {
  const b = randomBytes(len);
  return Array.from(b, (x) => ALPHA[x % ALPHA.length]).join("");
}
export const newToken = () => randomBytes(24).toString("hex");
export const newPlayerId = () => randomUUID().slice(0, 8);

export function cleanName(raw: unknown): string {
  const s = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 20) : "";
  if (!s) throw new Error("Please enter a name");
  return s;
}
