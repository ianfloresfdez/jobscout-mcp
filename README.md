# jobscout-mcp

An MCP server for tech job hunting. Ask your AI assistant for jobs in plain language and it searches several job boards at once, tells you what the market is asking for, and ranks the offers against your own skills.

```
You:     Find AI engineer roles I could apply to from Barcelona.
         My skills: Python, FastAPI, LLMs, RAG, Docker, AWS, React, MCP, Claude, TypeScript.
Claude:  ⏵ rank_jobs_for_me
         Ranked 15 of 19 postings for "ai engineer" in Barcelona.
         Missing most often in the best matches: AI agents (10), Next.js (5), Machine learning (5)…

         - Senior Product Engineer  [hn:49962075]
           Revieve Oy | REMOTE [Europe / (GMT+2)] | remote | 14 days ago
           skills: TypeScript, AI agents, MCP, Claude, Evals, React
           fit 67/100 | you have: TypeScript, MCP, Claude, React | missing: AI agents, Evals
           https://news.ycombinator.com/item?id=49962075
         ...
```
<sub>Real output from October 2026. Remote roles open to Europe count as available from Barcelona.</sub>

## What it can do

| Tool | What it does |
|---|---|
| `search_jobs` | Searches every configured board in parallel and returns the newest matches with company, location, remote status, salary when published, and the skills each posting asks for. |
| `get_job` | Full description of one posting, with its skills and salary text. |
| `market_snapshot` | What a search looks like as a market: most requested skills and how often, remote share, salary ranges (median and middle half), companies with several openings. |
| `rank_jobs_for_me` | Scores each posting by how much of what it asks for you already have. Shows matched and missing skills per job, and the skills you're missing most often across the best fits. |
| `list_sources` | Which boards are ready and which need a key. |

There is also a `job_hunt` prompt that chains them: market overview, best five fits, and what to highlight in the top two applications.

## Sources

| Source | Coverage | Key |
|---|---|---|
| [Remotive](https://remotive.com) | Remote jobs worldwide | None |
| [Arbeitnow](https://www.arbeitnow.com) | Europe, many remote roles | None |
| [Hacker News "Who is hiring?"](https://news.ycombinator.com/submitted?id=whoishiring) | This month's thread, startups worldwide | None |
| [Himalayas](https://himalayas.app) | Remote jobs worldwide, with country restrictions | None |
| [Jobicy](https://jobicy.com) | Remote jobs open to Spain, Europe and EMEA | None |
| [Remote OK](https://remoteok.com) | Latest remote postings worldwide | None |
| [We Work Remotely](https://weworkremotely.com) | Latest remote postings worldwide | None |
| [Working Nomads](https://www.workingnomads.com) | Latest remote postings worldwide | None |
| Company career pages ([Greenhouse](https://developers.greenhouse.io/job-board.html), [Lever](https://github.com/lever/postings-api), [Ashby](https://developers.ashbyhq.com/docs/public-job-posting-api)) | Every open role of the companies you pick, on-site and hybrid included | None; list them in `JOBSCOUT_COMPANIES` |
| [Adzuna](https://developer.adzuna.com) | Spain (or 15+ other countries) with salaries | Free `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` |

Eight sources work with no setup. Add the free Adzuna key for on-site and hybrid roles in Spain, and the
companies you care about as `JOBSCOUT_COMPANIES="greenhouse:typeform,lever:lodgify,ashby:preply"` (the slug is the
last part of the company's board URL, e.g. `job-boards.greenhouse.io/typeform`).

## Install

Requires Node.js 18.17 or newer.

```bash
git clone https://github.com/ianfloresfdez/jobscout-mcp
cd jobscout-mcp
npm install
npm run build
```

### Claude Desktop

Add this to `claude_desktop_config.json` (Settings → Developer → Edit config) and restart Claude:

```json
{
  "mcpServers": {
    "jobscout": {
      "command": "node",
      "args": ["/absolute/path/to/jobscout-mcp/dist/index.js"],
      "env": {
        "ADZUNA_APP_ID": "your-id",
        "ADZUNA_APP_KEY": "your-key",
        "ADZUNA_COUNTRY": "es"
      }
    }
  }
}
```

The `env` block is optional; leave it out to use only the key-free boards.

### Claude Code

```bash
claude mcp add jobscout -- node /absolute/path/to/jobscout-mcp/dist/index.js
```

### Cursor, Windsurf and other clients

Any MCP client that runs stdio servers works with the same command: `node /absolute/path/to/jobscout-mcp/dist/index.js`.

## Try it

- "What do AI engineer roles in Europe ask for right now, and what do they pay?"
- "Search remote LLM jobs posted in the last week."
- "Rank Python backend jobs in Spain against my CV" (paste your skills)
- "Open the second one and tell me what to put first in my cover letter."

## How it works

- **One search, many boards.** Sources run in parallel. If one is down or rate-limited, you still get the others, and the result says which one failed and why.
- **Same shape for every posting.** Each board is mapped to one `Job` type: title, company, location, remote flag, URL, date, salary, tags, and plain-text description.
- **Skills are detected, not guessed.** A dictionary of about 80 technologies with their aliases (`react.js`, `k8s`, `pgvector`, `retrieval-augmented`…) is matched against each posting. Your own skill list goes through the same aliases, so "LLM" and "large language models" count as the same thing.
- **Fit score.** The weighted share of a posting's skills you already have. Skills named in the job title count double. Postings that mention fewer than two known skills are left out of the ranking rather than scored on noise.
- **Salaries.** Read from the structured fields where a board has them (Adzuna), otherwise parsed from the text (`$120k-150k`, `55.000-65.000 €`, `€500/day`). Ranges are annualised for comparison and reported per currency. Adzuna's predicted salaries are ignored.
- **Location.** "Barcelona" also matches remote roles open to Spain, Europe or anywhere. "remote" keeps only postings that say remote.
- **Caching.** Results are cached for 10 minutes, so follow-up questions in a conversation don't refetch.

## Development

```bash
npm test          # unit tests with recorded fixtures, no network
npm run build
npm run inspect   # opens the MCP Inspector against the built server
```

To add a board, implement the `Source` interface in `src/sources/` and register it in `src/search.ts`.

## Notes

jobscout only reads public listings through each board's official API or public feed, and links to the original posting to apply. Respect each board's terms of use.

## License

MIT
