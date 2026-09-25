import { Actor, log } from 'apify'
import { runAdapter } from './adapters.js'
import { sendCompanyResult, sendJobs, sendRunComplete } from './callback.js'
import { detectCompanySource, discoverStructuredSource } from './detect.js'
import type { ActorInput, CompanyResult } from './types.js'
import { DEFAULT_SCAN_POLICY, evaluateEligibility } from './eligibility.js'

await Actor.init()

try {
  const input = await Actor.getInput<ActorInput>()
  if (!input?.runId || !input.callbackBaseUrl || !input.callbackToken || !Array.isArray(input.companies) || !input.targetingProfile) {
    throw new Error('runId, callbackBaseUrl, callbackToken, companies, and targetingProfile are required')
  }
  const policy = { ...DEFAULT_SCAN_POLICY, ...input.policy }

  for (const company of input.companies) {
    let companyResult: CompanyResult
    try {
      log.info(`Detecting ${company.name}`, { companyId: company.id })
      let detected = await detectCompanySource(company)
      let adapterResult = await runAdapter(company, detected.source, detected.sourceKey, detected.careersUrl, { targetingProfile: input.targetingProfile, policy })
      if (adapterResult.jobsDiscovered === 0 && ['greenhouse', 'lever', 'ashby'].includes(detected.source)) {
        const replacement = await discoverStructuredSource(company, new Set([detected.source]))
        if (replacement) {
          log.info(`Replacing empty ${detected.source} source for ${company.name} with ${replacement.source}`)
          detected = replacement
          adapterResult = await runAdapter(company, detected.source, detected.sourceKey, detected.careersUrl, { targetingProfile: input.targetingProfile, policy })
        }
      }
      const eligible = adapterResult.jobs
        .filter((job) => evaluateEligibility(job, input.targetingProfile, policy).eligible)
        .sort((left, right) => (Date.parse(right.postedAt ?? '') || 0) - (Date.parse(left.postedAt ?? '') || 0))
      const jobs = eligible.slice(0, policy.maxStoredJobsPerCompany)
      const eligibilityLimitReached = eligible.length > policy.maxStoredJobsPerCompany
      await Actor.pushData(jobs.map((job) => ({ runId: input.runId, companyId: company.id, companyName: company.name, ...job })))
      await sendJobs(input.callbackBaseUrl, input.runId, input.callbackToken, company.id, jobs)
      companyResult = {
        companyId: company.id,
        status: adapterResult.status === 'partial' || eligibilityLimitReached ? 'partial' : adapterResult.status,
        detectedSource: adapterResult.detectedSource,
        detectedSourceKey: adapterResult.detectedSourceKey,
        careersUrl: adapterResult.careersUrl,
        pagesVisited: adapterResult.pagesVisited,
        jobsDiscovered: adapterResult.jobsDiscovered,
        jobsFound: jobs.length,
        stopReason: eligibilityLimitReached ? 'eligible job storage limit reached' : adapterResult.stopReason,
        error: adapterResult.error,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.exception(error instanceof Error ? error : new Error(message), `Failed ${company.name}`)
      companyResult = { companyId: company.id, status: 'failed', detectedSource: company.sourceType,
        detectedSourceKey: company.sourceKey, careersUrl: company.careersUrl, pagesVisited: 0, jobsFound: 0,
        jobsDiscovered: 0, stopReason: 'failed', error: message }
    }
    await sendCompanyResult(input.callbackBaseUrl, input.runId, input.callbackToken, companyResult)
  }
  await sendRunComplete(input.callbackBaseUrl, input.runId, input.callbackToken)
} finally {
  await Actor.exit()
}
