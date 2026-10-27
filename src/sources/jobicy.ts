import type { Job, Source } from "../types.js";
import { fetchJson, htmlToText } from "../util.js";
import { parseSalary, structuredSalary } from "../salary.js";

interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName?: string;
  jobIndustry?: string[];
  jobType?: string[];
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
}

export function mapJobicy(j: JobicyJob): Job {
  const description = htmlToText(j.jobDescription || j.jobExcerpt);
  return {
    id: `jobicy:${j.id}`,
    source: "jobicy",
    title: htmlToText(j.jobTitle),
    company: j.companyName?.trim() || "Unknown",
    location: j.jobGeo?.replace(/\s*,\s*/g, ", ").trim() || "Remote",
    remote: true,
    url: j.url,
    postedAt: j.pubDate ? new Date(j.pubDate).toISOString() : null,
    salary: structuredSalary(j.salaryMin, j.salaryMax, j.salaryCurrency, j.salaryPeriod) ?? parseSalary(description),
    tags: [...(j.jobIndustry ?? []), ...(j.jobType ?? []), ...(j.jobLevel ? [j.jobLevel] : [])].map(htmlToText),
    description,
  };
}

/** Regions always requested: the project targets Spain and Europe (the API returns at most 50 per call). */
const GEOS = ["spain", "europe", "emea"];

/** Jobicy: remote-only board with a free public API (no key); keyword search plus a region filter. */
export const jobicy: Source = {
  id: "jobicy",
  label: "Jobicy (remote, Spain/Europe)",
  unavailable: () => null,
  async search({ query }) {
    const settled = await Promise.allSettled(
      GEOS.map((geo) =>
        fetchJson<{ jobs?: JobicyJob[] }>(`https://jobicy.com/api/v2/remote-jobs?count=50&geo=${geo}&tag=${encodeURIComponent(query)}`),
      ),
    );
    const all = settled.flatMap((s) => (s.status === "fulfilled" ? s.value.jobs ?? [] : []));
    if (!all.length && settled.every((s) => s.status === "rejected")) throw (settled[0] as PromiseRejectedResult).reason;
    const byId = new Map(all.map((j) => [j.id, j]));
    return [...byId.values()].map(mapJobicy);
  },
};
