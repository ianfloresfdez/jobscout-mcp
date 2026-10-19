import type { Job, Salary, SourceResult } from "./types.js";
import type { Ranked, Snapshot } from "./analysis.js";
import { jobSkills } from "./analysis.js";
import { SOURCES } from "./search.js";
import { daysAgo, truncate } from "./util.js";

const SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

export function money(n: number, currency: string | null): string {
  const sym = currency ? SYMBOL[currency] : undefined;
  const v = n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n));
  return sym ? `${sym}${v}` : `${v}${currency ? " " + currency : ""}`;
}

export function salaryText(s: Salary | null): string | null {
  if (!s || (s.min === null && s.max === null)) return null;
  const range = s.min !== null && s.max !== null && s.min !== s.max
    ? `${money(s.min, s.currency)}-${money(s.max, s.currency).replace(/^[€$£]/, "")}`
    : money((s.min ?? s.max)!, s.currency);
  return `${range}${s.period ? "/" + s.period : ""}`;
}

function age(job: Job): string {
  const d = daysAgo(job.postedAt);
  return d === null ? "date unknown" : d <= 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`;
}

export function jobLine(job: Job, extra?: string): string {
  const bits = [
    job.company,
    job.location,
    job.remote === true ? "remote" : job.remote === false ? "on-site" : null,
    salaryText(job.salary),
    age(job),
  ].filter(Boolean);
  const skills = jobSkills(job).all.slice(0, 8).join(", ");
  return [
    `- ${job.title}  [${job.id}]`,
    `  ${bits.join(" | ")}`,
    skills ? `  skills: ${skills}` : null,
    extra ? `  ${extra}` : null,
    `  ${job.url}`,
  ].filter(Boolean).join("\n");
}

export function sourceStatus(perSource: SourceResult[]): string {
  return perSource
    .map((r) => {
      const label = SOURCES[r.source].label;
      if (r.skipped) return `${label}: skipped (${r.skipped})`;
      if (r.error) return `${label}: failed (${truncate(r.error, 120)})`;
      return `${label}: ${r.jobs.length}`;
    })
    .join("\n");
}

export function snapshotText(s: Snapshot, query: string, location?: string): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const known = s.remote.yes + s.remote.no;
  const lines = [
    `Market snapshot for "${query}"${location ? ` in ${location}` : ""}: ${s.total} postings.`,
    "",
    `Remote: ${known ? `${pct(s.remote.yes / known)} of postings that say (${s.remote.yes} remote, ${s.remote.no} on-site)` : "not stated"}${s.remote.unknown ? `, ${s.remote.unknown} don't say` : ""}.`,
    "",
    "Most requested skills (share of postings):",
    ...s.topSkills.map((t) => `- ${t.skill}: ${pct(t.share)} (${t.count})${t.group ? `  [${t.group}]` : ""}`),
    "",
  ];
  if (s.salaries.length) {
    lines.push(`Salaries, annualised range midpoints (${pct(s.salaryCoverage)} of postings publish one):`);
    for (const x of s.salaries) lines.push(`- ${x.currency}: median ${money(x.median, x.currency)}, middle half ${money(x.p25, x.currency)} to ${money(x.p75, x.currency)} (n=${x.n})`);
  } else {
    lines.push(`Salaries: too few postings publish one to summarise (${pct(s.salaryCoverage)}).`);
  }
  if (s.topCompanies.length) {
    lines.push("", "Companies with several open postings:", ...s.topCompanies.map((c) => `- ${c.company}: ${c.count}`));
  }
  return lines.join("\n");
}

export function rankedText(r: Ranked): string {
  const extra = [
    `fit ${r.score}/100`,
    r.matched.length ? `you have: ${r.matched.join(", ")}` : null,
    r.missing.length ? `missing: ${r.missing.join(", ")}` : null,
  ].filter(Boolean).join(" | ");
  return jobLine(r.job, extra);
}
