import type { Job, Source } from "../types.js";
import { fetchJson, htmlToText, norm, truncate, TtlCache } from "../util.js";
import { queryTokens } from "../query.js";
import { parseSalary } from "../salary.js";

interface StoryHit { objectID: string; title: string; created_at: string }
interface CommentHit { objectID: string; comment_text?: string; author: string; created_at: string; parent_id: number; story_id: number }

const ROLE = /engineer|developer|scientist|architect|lead|head of|cto|manager|designer|researcher|analyst|devops|sre|ml|ai|founding|full[- ]?stack|backend|frontend|intern/i;
const PLACE = /remote|onsite|on-site|hybrid|\b[A-Z][a-z]+,\s?[A-Z]{2}\b|london|berlin|barcelona|madrid|paris|amsterdam|new york|nyc|sf|san francisco|europe|eu\b|usa|us\b|uk\b|canada|anywhere|worldwide/i;

/**
 * Turns a "Who is hiring?" comment into a Job. Postings conventionally open with
 * "Company | Role | Location | REMOTE | salary" on the first line.
 */
export function mapHnComment(c: CommentHit, storyTitle: string, query = ""): Job | null {
  const text = htmlToText(c.comment_text);
  if (text.length < 80) return null;
  const firstLine = text.split("\n")[0];
  const parts = firstLine.split(/\s+[|•·–—]\s+|\s\|\s?|\|/).map((s) => s.trim()).filter(Boolean);
  const company = truncate(parts[0] ?? "Unknown", 60);
  // Postings often list several roles; prefer the one that matches what the user searched for.
  const tokens = queryTokens(query);
  const hits = (p: string) => tokens.filter((t) => norm(p).includes(t)).length;
  const roleParts = parts.slice(1).filter((p) => ROLE.test(p));
  const best = tokens.length ? [...roleParts].sort((a, b) => hits(b) - hits(a))[0] : undefined;
  const role = (best && hits(best) > 0 ? best : undefined)
    ?? roleParts.find((p) => !PLACE.test(p)) ?? roleParts[0];
  const location = parts.slice(1).filter((p) => PLACE.test(p) && p !== role).join(", ");
  const remoteText = /\bremote\b/i.test(firstLine);
  const onsiteOnly = /\b(onsite|on-site|in office)\b/i.test(firstLine) && !remoteText;
  return {
    id: `hn:${c.objectID}`,
    source: "hn",
    title: truncate(role ?? firstLine, 140),
    company,
    location: location || (remoteText ? "Remote" : "See posting"),
    remote: remoteText ? true : onsiteOnly ? false : null,
    url: `https://news.ycombinator.com/item?id=${c.objectID}`,
    postedAt: c.created_at ? new Date(c.created_at).toISOString() : null,
    salary: parseSalary(firstLine) ?? parseSalary(text.slice(0, 600)),
    tags: [storyTitle.replace(/^Ask HN:\s*/i, "")],
    description: text,
  };
}

const storyCache = new TtlCache<StoryHit>(60 * 60 * 1000);

async function latestWhoIsHiring(): Promise<StoryHit> {
  const cached = storyCache.get("latest");
  if (cached) return cached;
  const data = await fetchJson<{ hits: StoryHit[] }>(
    "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10",
  );
  const story = data.hits.find((h) => /who is hiring/i.test(h.title));
  if (!story) throw new Error("could not find this month's 'Who is hiring?' thread");
  storyCache.set("latest", story);
  return story;
}

/** Hacker News "Ask HN: Who is hiring?" monthly thread, searched through the public Algolia API (no key). */
export const hn: Source = {
  id: "hn",
  label: "Hacker News 'Who is hiring?'",
  unavailable: () => null,
  async search({ query }) {
    const story = await latestWhoIsHiring();
    const url =
      `https://hn.algolia.com/api/v1/search?tags=comment,story_${story.objectID}` +
      `&hitsPerPage=200&query=${encodeURIComponent(query)}`;
    const data = await fetchJson<{ hits: CommentHit[] }>(url);
    return data.hits
      .filter((h) => String(h.parent_id) === story.objectID) // top-level comments are the postings
      .map((h) => mapHnComment(h, story.title, query))
      .filter((j): j is Job => j !== null);
  },
};
