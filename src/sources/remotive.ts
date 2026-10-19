import type { Job, Source } from "../types.js";
import { fetchJson, htmlToText } from "../util.js";
import { parseSalary } from "../salary.js";

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

export function mapRemotive(j: RemotiveJob): Job {
  return {
    id: `remotive:${j.id}`,
    source: "remotive",
    title: j.title.trim(),
    company: j.company_name?.trim() || "Unknown",
    location: j.candidate_required_location?.trim() || "Remote",
    remote: true,
    url: j.url,
    postedAt: j.publication_date ? new Date(j.publication_date.endsWith("Z") ? j.publication_date : j.publication_date + "Z").toISOString() : null,
    salary: parseSalary(j.salary),
    tags: [...(j.tags ?? []), ...(j.category ? [j.category] : []), ...(j.job_type ? [j.job_type.replace(/_/g, " ")] : [])],
    description: htmlToText(j.description),
  };
}

/** Remotive: remote-only board with a free public API (no key). Server-side search on title and tags. */
export const remotive: Source = {
  id: "remotive",
  label: "Remotive (remote jobs)",
  unavailable: () => null,
  async search({ query }) {
    const url = `https://remotive.com/api/remote-jobs?limit=150&search=${encodeURIComponent(query)}`;
    const data = await fetchJson<{ jobs: RemotiveJob[] }>(url);
    return (data.jobs ?? []).map(mapRemotive);
  },
};
