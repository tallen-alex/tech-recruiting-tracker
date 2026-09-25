const API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

import type { TargetingProfile } from '../types'

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }

type ToolCallOpts = {
  apiKey: string
  model?: string
  maxTokens?: number
  system?: string
  content: ContentBlock[]
  toolName: string
  toolDescription: string
  // biome-ignore lint: JSON Schema, shape is caller-defined
  inputSchema: Record<string, unknown>
}

async function callClaudeTool<T>(opts: ToolCallOpts): Promise<T> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': opts.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model ?? 'claude-sonnet-5',
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: 'user', content: opts.content }],
      tools: [{ name: opts.toolName, description: opts.toolDescription, input_schema: opts.inputSchema }],
      tool_choice: { type: 'tool', name: opts.toolName },
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Claude API request failed (${res.status}): ${body}`)
  }
  const data = (await res.json()) as { content: Array<{ type: string; input?: unknown }> }
  const toolUse = data.content.find((block) => block.type === 'tool_use')
  if (!toolUse) throw new Error('Claude did not return a tool_use block')
  return toolUse.input as T
}

export async function parseResume(opts: {
  apiKey: string
  pdfBase64: string
}): Promise<{ resumeText: string; roleFitSummary: string }> {
  const result = await callClaudeTool<{ resume_text: string; role_fit_summary: string }>({
    apiKey: opts.apiKey,
    maxTokens: 4096,
    content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: opts.pdfBase64 } },
      {
        type: 'text',
        text: 'Read this resume. Transcribe its full text content, and separately write a short, honest 2-4 sentence summary of what kinds of roles and seniority levels this person is well-suited for based on their actual experience — no flattery, no invented qualifications.',
      },
    ],
    toolName: 'submit_resume_analysis',
    toolDescription: 'Submit the transcribed resume text and a role-fit summary.',
    inputSchema: {
      type: 'object',
      properties: {
        resume_text: { type: 'string', description: 'Full plain-text transcription of the resume' },
        role_fit_summary: { type: 'string', description: '2-4 sentence summary of fitting roles/seniority' },
      },
      required: ['resume_text', 'role_fit_summary'],
    },
  })
  return { resumeText: result.resume_text, roleFitSummary: result.role_fit_summary }
}

export async function scoreJobRelevance(opts: {
  apiKey: string
  resumeText: string
  rolePreferences: string | null
  companyPreferences: string | null
  job: { title: string; company_name: string; location: string | null; description: string | null }
}): Promise<{ score: number; reason: string }> {
  const { job } = opts
  const prompt = [
    `RESUME:\n${opts.resumeText}`,
    opts.rolePreferences ? `ROLE PREFERENCES:\n${opts.rolePreferences}` : null,
    opts.companyPreferences ? `COMPANY PREFERENCES:\n${opts.companyPreferences}` : null,
    `JOB POSTING:\nCompany: ${job.company_name}\nTitle: ${job.title}\nLocation: ${job.location ?? 'unspecified'}\nDescription: ${(job.description ?? '').slice(0, 6000)}`,
    'Rate how well this specific job posting fits this person, 0-100, honestly — most jobs should NOT score near 100. Give a one-sentence reason grounded in specifics from the resume and posting, not generic praise.',
  ]
    .filter(Boolean)
    .join('\n\n')

  return callClaudeTool({
    apiKey: opts.apiKey,
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 512,
    content: [{ type: 'text', text: prompt }],
    toolName: 'submit_relevance_score',
    toolDescription: 'Submit a 0-100 relevance score and a short reason for this job posting.',
    inputSchema: {
      type: 'object',
      properties: {
        score: { type: 'number', description: '0-100 relevance score' },
        reason: { type: 'string', description: 'One-sentence, specific reason for the score' },
      },
      required: ['score', 'reason'],
    },
  })
}

export async function generateTargetingProfile(opts: {
  apiKey: string
  resumeText: string | null
  roleFitSummary: string | null
  rolePreferences: string | null
  locationKeywords: string | null
}): Promise<TargetingProfile> {
  const prompt = [
    opts.resumeText ? `RESUME:\n${opts.resumeText.slice(0, 20000)}` : null,
    opts.roleFitSummary ? `ROLE FIT SUMMARY:\n${opts.roleFitSummary}` : null,
    opts.rolePreferences ? `ROLE PREFERENCES:\n${opts.rolePreferences}` : null,
    opts.locationKeywords ? `LOCATION PREFERENCES:\n${opts.locationKeywords}` : null,
    'Create a concise job-targeting profile. Use short title phrases and skill names that can be matched deterministically. Do not invent experience. excluded_titles should contain roles the stated preferences clearly rule out.',
  ].filter(Boolean).join('\n\n')

  return callClaudeTool<TargetingProfile>({
    apiKey: opts.apiKey,
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 1536,
    content: [{ type: 'text', text: prompt }],
    toolName: 'submit_targeting_profile',
    toolDescription: 'Submit the structured job-targeting profile.',
    inputSchema: {
      type: 'object',
      properties: {
        target_titles: { type: 'array', items: { type: 'string' } },
        adjacent_titles: { type: 'array', items: { type: 'string' } },
        seniority: { type: 'array', items: { type: 'string' } },
        skills: { type: 'array', items: { type: 'string' } },
        excluded_titles: { type: 'array', items: { type: 'string' } },
        locations: { type: 'array', items: { type: 'string' } },
      },
      required: ['target_titles', 'adjacent_titles', 'seniority', 'skills', 'excluded_titles', 'locations'],
    },
  })
}

export async function scoreJobsRelevanceBatch(opts: {
  apiKey: string
  resumeText: string
  rolePreferences: string | null
  companyPreferences: string | null
  jobs: Array<{ id: number; title: string; company_name: string; location: string | null; description: string | null }>
}): Promise<Array<{ id: number; score: number; reason: string }>> {
  const prompt = [
    `RESUME:\n${opts.resumeText.slice(0, 20000)}`,
    opts.rolePreferences ? `ROLE PREFERENCES:\n${opts.rolePreferences}` : null,
    opts.companyPreferences ? `COMPANY PREFERENCES:\n${opts.companyPreferences}` : null,
    `JOBS:\n${opts.jobs.map((job) => `ID ${job.id}\n${job.company_name} — ${job.title}\n${job.location ?? 'unspecified'}\n${(job.description ?? '').slice(0, 2500)}`).join('\n\n')}`,
    'Score each job 0-100 for this person. Most jobs should not score near 100. Return every supplied ID exactly once with a one-sentence evidence-based reason.',
  ].filter(Boolean).join('\n\n')

  const result = await callClaudeTool<{ scores: Array<{ id: number; score: number; reason: string }> }>({
    apiKey: opts.apiKey,
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 2048,
    content: [{ type: 'text', text: prompt }],
    toolName: 'submit_relevance_scores',
    toolDescription: 'Submit relevance scores for the supplied jobs.',
    inputSchema: {
      type: 'object',
      properties: {
        scores: { type: 'array', items: { type: 'object', properties: {
          id: { type: 'number' }, score: { type: 'number' }, reason: { type: 'string' },
        }, required: ['id', 'score', 'reason'] } },
      },
      required: ['scores'],
    },
  })
  return result.scores
}

type SearchToolCallOpts = {
  apiKey: string
  model?: string
  maxTokens?: number
  userText: string
  maxSearches: number
  toolName: string
  toolDescription: string
  // biome-ignore lint: JSON Schema, shape is caller-defined
  inputSchema: Record<string, unknown>
}

/**
 * Web search is a server-side tool: Anthropic executes the search(es) and injects results within this
 * one request, so the model can search first and then (hopefully) call our reporting tool. Unlike
 * callClaudeTool, tool_choice can't be forced here — forcing it would prevent the model from searching
 * at all. So this returns null (never throws) when the model answered in plain text instead of calling
 * the tool; callers must treat that as "couldn't determine," not a hard failure.
 */
async function callClaudeWithSearch<T>(opts: SearchToolCallOpts): Promise<T | null> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': opts.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model ?? 'claude-sonnet-5',
      max_tokens: opts.maxTokens ?? 1024,
      messages: [{ role: 'user', content: opts.userText }],
      tools: [
        { type: 'web_search_20250305', name: 'web_search', max_uses: opts.maxSearches },
        { name: opts.toolName, description: opts.toolDescription, input_schema: opts.inputSchema },
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Claude API request failed (${res.status}): ${body}`)
  }
  const data = (await res.json()) as { content: Array<{ type: string; name?: string; input?: unknown }> }
  const toolUse = data.content.find((block) => block.type === 'tool_use' && block.name === opts.toolName)
  return toolUse ? (toolUse.input as T) : null
}

export type CareersInfo = {
  ats_type: 'greenhouse' | 'lever' | 'custom' | null
  ats_slug: string | null
  careers_url: string | null
}

/** Web-search-backed fallback when free slug-guessing doesn't find a company's board. Callers should still verify a returned greenhouse/lever slug against the real API before trusting it — search grounding reduces but doesn't eliminate hallucination risk. */
export async function discoverCompanyCareersInfo(opts: { apiKey: string; companyName: string }): Promise<CareersInfo | null> {
  return callClaudeWithSearch<CareersInfo>({
    apiKey: opts.apiKey,
    maxSearches: 3,
    userText: `Find ${opts.companyName}'s current job listings / careers page via search. If they use Greenhouse (a URL under boards.greenhouse.io or job-boards.greenhouse.io/${opts.companyName.toLowerCase()}) or Lever (jobs.lever.co/...), report the exact board slug from that URL as ats_type "greenhouse" or "lever". Otherwise report their direct careers/jobs page URL as ats_type "custom". Only report what you can verify from actual search results — if you can't confidently find it, call the tool with ats_type null rather than guessing.`,
    toolName: 'submit_careers_info',
    toolDescription: 'Report where this company posts jobs, based on search results.',
    inputSchema: {
      type: 'object',
      properties: {
        ats_type: { type: ['string', 'null'], enum: ['greenhouse', 'lever', 'custom', null] },
        ats_slug: { type: ['string', 'null'], description: 'Board slug, only when ats_type is greenhouse or lever' },
        careers_url: { type: ['string', 'null'], description: 'Direct careers page URL, only when ats_type is custom' },
      },
      required: ['ats_type', 'ats_slug', 'careers_url'],
    },
  })
}

export type SuggestedCompany = { name: string; reason: string }

/** Suggests real companies via web search — never suggests from memory alone, since an ungrounded LLM can confidently name companies that don't exist or aren't actually hiring. */
export async function suggestCompanies(opts: {
  apiKey: string
  resumeText: string
  rolePreferences: string | null
  companyPreferences: string | null
  excludeNames: string[]
  count: number
}): Promise<SuggestedCompany[]> {
  const prompt = [
    `RESUME:\n${opts.resumeText}`,
    opts.rolePreferences ? `ROLE PREFERENCES:\n${opts.rolePreferences}` : null,
    opts.companyPreferences ? `COMPANY PREFERENCES:\n${opts.companyPreferences}` : null,
    opts.excludeNames.length > 0 ? `ALREADY TRACKED — do not suggest these again:\n${opts.excludeNames.join(', ')}` : null,
    `Search for and suggest up to ${opts.count} real, currently-operating companies that would be strong job-search targets for this person, based on their actual experience and stated preferences. Verify each is real and plausibly hiring in a relevant space via search — do not suggest a company from memory alone without checking. One short, specific reason per company.`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callClaudeWithSearch<{ companies: SuggestedCompany[] }>({
    apiKey: opts.apiKey,
    maxSearches: 6,
    maxTokens: 2048,
    userText: prompt,
    toolName: 'submit_company_suggestions',
    toolDescription: 'Submit the suggested companies.',
    inputSchema: {
      type: 'object',
      properties: {
        companies: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['name', 'reason'],
          },
        },
      },
      required: ['companies'],
    },
  })
  return result?.companies ?? []
}

export type ExtractedJob = {
  title: string
  url: string
  location: string | null
  posted_at: string | null
  deadline: string | null
}

export async function extractJobsFromCareerPage(opts: {
  apiKey: string
  html: string
  companyName: string
  pageUrl: string
}): Promise<ExtractedJob[]> {
  const prompt = `Here is the rendered HTML of ${opts.companyName}'s careers page (${opts.pageUrl}). Extract every distinct job posting actually listed: its title, a direct/absolute URL (resolve relative links against ${opts.pageUrl}), its location if shown, its posting date if shown (ISO format if you can tell, otherwise omit), and its application deadline if one is explicitly stated (ISO date, otherwise omit — do not infer a deadline that isn't stated). Do not invent postings that aren't present. If nothing is listed, return an empty array.\n\nHTML:\n${opts.html.slice(0, 60000)}`

  const result = await callClaudeTool<{ jobs: ExtractedJob[] }>({
    apiKey: opts.apiKey,
    maxTokens: 4096,
    content: [{ type: 'text', text: prompt }],
    toolName: 'submit_job_listings',
    toolDescription: 'Submit the list of job postings found on this career page.',
    inputSchema: {
      type: 'object',
      properties: {
        jobs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              location: { type: ['string', 'null'] },
              posted_at: { type: ['string', 'null'] },
              deadline: { type: ['string', 'null'], description: 'Application deadline, only if explicitly stated' },
            },
            required: ['title', 'url'],
          },
        },
      },
      required: ['jobs'],
    },
  })
  return result.jobs
}
