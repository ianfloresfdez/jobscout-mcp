import type { Job, Source } from "../types.js";
import { fetchJson, htmlToText, TtlCache } from "../util.js";
import { parseSalary } from "../salary.js";

interface WorkingNomadsJob {
  url: string;
  title: string;
  description?: string;
  company_name?: string;
  category_name?: string;
  tags?: string;
  location?: string;
  pub_date?: string;
}

export function mapWorkingNomads(j: WorkingNomadsJob): Job {
  const description = htmlToText(j.description);
  return {
    id: `workingnomads:${j.url.match(/\/(\d+)\/?$/)?.[1] ?? j.url}`,
    source: "workingnomads",
    title: htmlToText(j.title),
    company: j.company_name?.trim() || "Unknown",
    location: j.location?.trim() || "Remote",
    remote: true,
    url: j.url,
    postedAt: j.pub_date ? new Date(j.pub_date).toISOString() : null,
    salary: parseSalary(description),
    tags: [...(j.tags ? j.tags.split(",").map((t) => t.trim()) : []), ...(j.category_name ? [j.category_name] : [])],
    description,
  };
}

// The feed has no search: fetch it once and reuse it for every query
const feed = new TtlCache<Job[]>(10 * 60 * 1000);

/** Working Nomads: remote-only board; public feed of the latest postings (no key, no server-side search). */
export const workingnomads: Source = {
  id: "workingnomads",
  label: "Working Nomads (remote jobs)",
  unavailable: () => null,
  async search() {
    const hit = feed.get("all");
    if (hit) return hit;
    const data = await fetchJson<WorkingNomadsJob[]>("https://www.workingnomads.com/api/exposed_jobs/", { timeoutMs: 20_000 });
    const jobs = data.filter((j) => j.url && j.title).map(mapWorkingNomads);
    feed.set("all", jobs);
    return jobs;
  },
};
