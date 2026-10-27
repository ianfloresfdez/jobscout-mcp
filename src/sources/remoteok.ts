import type { Job, Source } from "../types.js";
import { fetchJson, htmlToText, TtlCache } from "../util.js";
import { parseSalary, structuredSalary } from "../salary.js";

interface RemoteOkJob {
  id: string;
  slug?: string;
  epoch?: number;
  date?: string;
  company?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  url?: string;
  apply_url?: string;
  legal?: string;
}

export function mapRemoteOk(j: RemoteOkJob): Job {
  const description = htmlToText(j.description);
  return {
    id: `remoteok:${j.id}`,
    source: "remoteok",
    title: htmlToText(j.position),
    company: htmlToText(j.company) || "Unknown",
    location: htmlToText(j.location) || "Remote",
    remote: true,
    url: j.url || `https://remoteok.com/remote-jobs/${j.id}`,
    postedAt: j.date ? new Date(j.date).toISOString() : j.epoch ? new Date(j.epoch * 1000).toISOString() : null,
    salary: structuredSalary(j.salary_min, j.salary_max, "USD", "year") ?? parseSalary(description),
    tags: j.tags ?? [],
    description,
  };
}

// The feed has no search: fetch it once and reuse it for every query
const feed = new TtlCache<Job[]>(10 * 60 * 1000);

/** Remote OK: remote-only board, free public feed of the latest postings (no key, no server-side search). */
export const remoteok: Source = {
  id: "remoteok",
  label: "Remote OK (remote jobs)",
  unavailable: () => null,
  async search() {
    const hit = feed.get("all");
    if (hit) return hit;
    // The first element is the legal notice, not a posting
    const data = await fetchJson<RemoteOkJob[]>("https://remoteok.com/api");
    const jobs = data.filter((j) => j.id && j.position).map(mapRemoteOk);
    feed.set("all", jobs);
    return jobs;
  },
};
