#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SOURCES, searchJobs, seen } from "./search.js";
import { marketSnapshot, rankForProfile, jobSkills } from "./analysis.js";
import { jobLine, rankedText, salaryText, snapshotText, sourceStatus } from "./format.js";
import { canonicalizeSkills } from "./skills.js";
import { truncate } from "./util.js";
import type { SourceId } from "./types.js";

const server = new McpServer({ name: "jobscout", version: "0.1.0" });

const sourceIds = Object.keys(SOURCES) as [SourceId, ...SourceId[]];
const common = {
  query: z.string().min(1).describe('What to look for, e.g. "AI engineer", "python backend", "LLM". All words must appear in the posting.'),
  location: z.string().optional().describe('City, country or "remote", e.g. "Barcelona", "Spain", "Europe". Remote roles open to that place are included.'),
  remote_only: z.boolean().optional().describe("Only postings that say they are remote."),
  max_age_days: z.number().int().min(1).max(120).optional().describe("Ignore postings older than this. Defaults to 30."),
  sources: z.array(z.enum(sourceIds)).optional().describe("Limit to some boards. Defaults to every board that is configured."),
};
const readOnly = { readOnlyHint: true, openWorldHint: true } as const;

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

server.registerTool(
  "search_jobs",
  {
    title: "Search tech jobs",
    description:
      "Search tech job postings across Remotive, Arbeitnow, Hacker News 'Who is hiring?' and Adzuna (Spain) at once. " +
      "Returns the newest matches with company, location, remote status, salary when published, the skills each posting asks for, and an id for get_job.",
    inputSchema: { ...common, limit: z.number().int().min(1).max(50).optional().describe("How many postings to return. Defaults to 15.") },
    annotations: readOnly,
  },
  async ({ query, location, remote_only, max_age_days, sources, limit }) => {
    const { jobs, perSource } = await searchJobs({ query, location, remoteOnly: remote_only, maxAgeDays: max_age_days ?? 30, sources });
    const shown = jobs.slice(0, limit ?? 15);
    const head = `${jobs.length} postings match "${query}"${location ? ` in ${location}` : ""}${remote_only ? ", remote only" : ""}. Showing the ${shown.length} newest.`;
    return text([head, "", "By source:", sourceStatus(perSource), "", ...shown.map((j) => jobLine(j))].join("\n"));
  },
);

server.registerTool(
  "get_job",
  {
    title: "Get job details",
    description: "Full description of a posting returned by search_jobs, rank_jobs_for_me or market_snapshot, with the skills it asks for and its salary text.",
    inputSchema: { id: z.string().describe('Posting id from a previous result, e.g. "remotive:1923456".') },
    annotations: readOnly,
  },
  async ({ id }) => {
    const job = seen.get(id);
    if (!job) return { ...text(`No posting with id "${id}" in this session. Run search_jobs first, then use an id from its results.`), isError: true };
    const salary = salaryText(job.salary);
    return text([
      `${job.title}`,
      `${job.company} | ${job.location} | ${job.remote === true ? "remote" : job.remote === false ? "on-site" : "remote not stated"}`,
      salary ? `Salary: ${salary}${job.salary?.raw ? ` (from "${job.salary.raw}")` : ""}` : "Salary: not published",
      `Posted: ${job.postedAt ?? "unknown"} | Source: ${SOURCES[job.source].label}`,
      `Skills mentioned: ${jobSkills(job).all.join(", ") || "none detected"}`,
      job.tags.length ? `Tags: ${job.tags.join(", ")}` : "",
      `Apply: ${job.url}`,
      "",
      truncate(job.description, 8000),
    ].filter((l) => l !== "").join("\n"));
  },
);

server.registerTool(
  "market_snapshot",
  {
    title: "Job market snapshot",
    description:
      "Summarise what the market asks for in a search: most requested skills and their share of postings, remote share, " +
      "salary ranges where postings publish them, and companies with several openings. Good for 'what should I learn' and 'what does this role pay'.",
    inputSchema: common,
    annotations: readOnly,
  },
  async ({ query, location, remote_only, max_age_days, sources }) => {
    const { jobs, perSource } = await searchJobs({ query, location, remoteOnly: remote_only, maxAgeDays: max_age_days ?? 60, sources });
    if (!jobs.length) return text(`No postings matched "${query}"${location ? ` in ${location}` : ""}.\n\nBy source:\n${sourceStatus(perSource)}`);
    return text(`${snapshotText(marketSnapshot(jobs), query, location)}\n\nBy source:\n${sourceStatus(perSource)}`);
  },
);

server.registerTool(
  "rank_jobs_for_me",
  {
    title: "Rank jobs against my skills",
    description:
      "Score postings by how much of what they ask for the candidate already has, best fit first. Each result lists the matched skills and the missing ones, " +
      "and the summary lists the skills missing most often across the best matches. Pass the skills from the user's CV or profile.",
    inputSchema: {
      ...common,
      skills: z.array(z.string()).min(1).describe('The candidate\'s skills, e.g. ["Python", "FastAPI", "LLMs", "RAG", "Docker", "AWS"].'),
      limit: z.number().int().min(1).max(30).optional().describe("How many postings to return. Defaults to 10."),
    },
    annotations: readOnly,
  },
  async ({ query, location, remote_only, max_age_days, sources, skills, limit }) => {
    const { known, unknown } = canonicalizeSkills(skills);
    const { jobs, perSource } = await searchJobs({ query, location, remoteOnly: remote_only, maxAgeDays: max_age_days ?? 30, sources });
    const { ranked, gaps } = rankForProfile(jobs, known, query);
    const top = ranked.slice(0, limit ?? 10);
    const head = [`Ranked ${ranked.length} of ${jobs.length} postings for "${query}"${location ? ` in ${location}` : ""} against: ${known.join(", ") || "no recognised skills"}.`];
    if (unknown.length) head.push(`Not recognised (ignored in scoring): ${unknown.join(", ")}.`);
    if (gaps.length) head.push(`Missing most often in the best matches: ${gaps.map((g) => `${g.skill} (${g.count})`).join(", ")}.`);
    return text([...head, "", ...top.map(rankedText), "", "By source:", sourceStatus(perSource)].join("\n"));
  },
);

server.registerTool(
  "list_sources",
  {
    title: "List job sources",
    description: "Which job boards are available and which need configuration (API keys).",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () =>
    text(Object.values(SOURCES).map((s) => `${s.id}: ${s.label}. ${s.unavailable() ?? "ready"}`).join("\n")),
);

server.registerPrompt(
  "job_hunt",
  {
    title: "Job hunt",
    description: "Find the best open roles for a profile and explain the gaps.",
    argsSchema: {
      role: z.string().describe('Target role, e.g. "AI engineer"'),
      location: z.string().optional().describe('e.g. "Barcelona" or "remote"'),
      skills: z.string().describe("Comma-separated skills from the CV"),
    },
  },
  ({ role, location, skills }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text:
          `I'm looking for ${role} roles${location ? ` in ${location}` : ""}. My skills: ${skills}.\n\n` +
          `1. Use market_snapshot to show what these roles ask for and pay.\n` +
          `2. Use rank_jobs_for_me with my skills and show the 5 best fits with links.\n` +
          `3. For the top 2, use get_job and tell me what to highlight in my application and what I'm missing.`,
      },
    }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("jobscout MCP server running on stdio");
