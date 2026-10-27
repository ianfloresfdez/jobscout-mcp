export type SourceId = "remotive" | "arbeitnow" | "hn" | "adzuna" | "himalayas" | "jobicy" | "remoteok";

export interface Salary {
  min: number | null;
  max: number | null;
  /** ISO 4217 code when known (EUR, USD, GBP). */
  currency: string | null;
  period: "year" | "month" | "hour" | null;
  /** The original text the numbers came from, kept so the model can double-check. */
  raw?: string;
}

export interface Job {
  /** Stable id, prefixed with the source: "remotive:123". */
  id: string;
  source: SourceId;
  title: string;
  company: string;
  location: string;
  /** true when the posting says remote, false when it says on-site, null when unknown. */
  remote: boolean | null;
  url: string;
  /** ISO date, or null when the source does not give one. */
  postedAt: string | null;
  salary: Salary | null;
  tags: string[];
  /** Plain-text description (HTML stripped). */
  description: string;
}

export interface SearchParams {
  query: string;
  location?: string;
  remoteOnly?: boolean;
  maxAgeDays?: number;
}

export interface SourceResult {
  source: SourceId;
  jobs: Job[];
  error?: string;
  skipped?: string;
}

export interface Source {
  id: SourceId;
  label: string;
  /** Returns why the source cannot run (e.g. missing API key), or null when it can. */
  unavailable(): string | null;
  search(params: SearchParams): Promise<Job[]>;
}
