import type { Job, Source } from "../types.js";
import { decodeEntities, htmlToText, TtlCache } from "../util.js";
import { parseSalary } from "../salary.js";

const UA = "jobscout-mcp/0.1 (+https://github.com/ianfloresfdez/jobscout-mcp)";

/** Text of an RSS tag, with CDATA unwrapped and entities decoded once. */
function tag(item: string, name: string): string {
  const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  if (!m) return "";
  return decodeEntities(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "")).trim();
}

/** Flags like "🇨🇦 Canada" are kept as plain country names. */
const noFlags = (s: string) => s.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").replace(/\s+/g, " ").trim();

export function mapWwrItem(item: string): Job | null {
  const full = tag(item, "title");
  const link = tag(item, "link") || tag(item, "guid");
  if (!full || !link) return null;
  // Titles are "Company: Role"
  const i = full.indexOf(": ");
  const description = htmlToText(tag(item, "description"));
  const region = noFlags(tag(item, "region"));
  const country = noFlags(tag(item, "country"));
  const pub = tag(item, "pubDate");
  return {
    id: `weworkremotely:${link.replace(/^https?:\/\/weworkremotely\.com\/remote-jobs\//, "")}`,
    source: "weworkremotely",
    title: i > 0 ? full.slice(i + 2).trim() : full,
    company: i > 0 ? full.slice(0, i).trim() : "Unknown",
    // A country list narrows the region ("Anywhere in the World" + "Canada and United States" = only those two)
    location: country || region || "Remote",
    remote: true,
    url: link,
    postedAt: pub ? new Date(pub).toISOString() : null,
    salary: parseSalary(description),
    tags: [tag(item, "category"), tag(item, "type"), ...tag(item, "skills").split(/,\s*|\s+and\s+/)].filter(Boolean),
    description,
  };
}

// The feed has no search: fetch it once and reuse it for every query
const feed = new TtlCache<Job[]>(10 * 60 * 1000);

/** We Work Remotely: remote-only board; public RSS feed of the latest postings (no key, no server-side search). */
export const weworkremotely: Source = {
  id: "weworkremotely",
  label: "We Work Remotely (remote jobs)",
  unavailable: () => null,
  async search() {
    const hit = feed.get("all");
    if (hit) return hit;
    const res = await fetch("https://weworkremotely.com/remote-jobs.rss", {
      headers: { "User-Agent": UA, Accept: "application/rss+xml" }, signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from weworkremotely.com`);
    const xml = await res.text();
    const jobs = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => mapWwrItem(m[1])).filter((j): j is Job => j !== null);
    feed.set("all", jobs);
    return jobs;
  },
};
