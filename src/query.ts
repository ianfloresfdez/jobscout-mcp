import { norm } from "./util.js";

const STOP = new Set(["and", "or", "the", "a", "de", "y", "en", "of", "for", "with", "jobs", "job", "role", "roles", "oferta", "ofertas"]);

/** Meaningful words of a search, normalised: "AI Engineer jobs" -> ["ai", "engineer"]. */
export function queryTokens(query: string): string[] {
  return norm(query).split(/[\s,/]+/).filter((t) => t.length > 0 && !STOP.has(t));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** How many of the query words appear as whole words in a text. */
export function tokenHits(text: string, tokens: string[]): number {
  const t = norm(text);
  return tokens.filter((w) => new RegExp(`(?<![a-z0-9])${escapeRe(w)}(?![a-z0-9])`).test(t)).length;
}
