import type { Job, Source } from "../types.js";
import { fetchJson, htmlToText, TtlCache } from "../util.js";
import { parseSalary } from "../salary.js";

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description?: string;
  remote?: boolean;
  url: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number;
}

export function mapArbeitnow(j: ArbeitnowJob): Job {
  const description = htmlToText(j.description);
  return {
    id: `arbeitnow:${j.slug}`,
    source: "arbeitnow",
    title: j.title.trim(),
    company: j.company_name?.trim() || "Unknown",
    location: j.location?.trim() || (j.remote ? "Remote" : "Unknown"),
    remote: typeof j.remote === "boolean" ? j.remote : null,
    url: j.url,
    postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
    salary: parseSalary(description),
    tags: [...(j.tags ?? []), ...(j.job_types ?? [])],
    description,
  };
}

const PAGES = 4;

// The board has no search, so every query returns the same pages: fetch them once per TTL. Refetching them per
// query used to trip the board's rate limit (HTTP 429) after the third or fourth query.
const feed = new TtlCache<Job[]>(10 * 60 * 1000);

/** Arbeitnow: European job board (mostly Germany, many remote roles). Free API, no key, no server-side search. */
export const arbeitnow: Source = {
  id: "arbeitnow",
  label: "Arbeitnow (Europe)",
  unavailable: () => null,
  async search() {
    const hit = feed.get("all");
    if (hit) return hit;
    const settled = await Promise.allSettled(
      Array.from({ length: PAGES }, (_, i) =>
        fetchJson<{ data: ArbeitnowJob[] }>(`https://www.arbeitnow.com/api/job-board-api?page=${i + 1}`),
      ),
    );
    const all = settled.flatMap((s) => (s.status === "fulfilled" ? s.value.data ?? [] : []));
    if (!all.length) {
      const first = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
      throw first ? first.reason : new Error("the board returned no postings");
    }
    const jobs = all.map(mapArbeitnow);
    feed.set("all", jobs);
    return jobs;
  },
};
