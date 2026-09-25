/**
 * CMS (12twenty) sync — injected into the school job board by the bookmarklet on the CMS tab.
 *
 * Runs in the user's already-authenticated browser because the board is session-gated and the Worker
 * can never reach it. Only user-initiated: nothing here runs on a schedule or in the background.
 *
 * Requests are throttled deliberately. This is a school platform, and a polite pace keeps a sync
 * indistinguishable from ordinary browsing.
 */
;(async () => {
  const QUERY_URL = '/Api/V2/job-postings/post-query'
  // 3 = Approved, 4 = Application Open. Closed postings (5) are never imported.
  const STATUS_IDS = [3, 4]
  const PAGE_SIZE = 100
  const THROTTLE_MS = 250
  const MAX_PAGES = 40

  const scriptSrc = (document.currentScript && document.currentScript.src) || ''
  const TRACKER = scriptSrc ? new URL(scriptSrc).origin : null
  if (!TRACKER) {
    alert('CMS sync: could not determine the tracker URL. Re-copy the bookmarklet from the CMS tab.')
    return
  }
  if (!/\.12twenty\.com$/i.test(location.hostname)) {
    alert('CMS sync: run this from your 12twenty job board tab.')
    return
  }

  const ui = document.createElement('div')
  ui.style.cssText = [
    'position:fixed', 'z-index:2147483647', 'right:16px', 'bottom:16px', 'width:320px',
    'padding:14px 16px', 'background:#ffffff', 'color:#16231c', 'border:1px solid #c7d3cc',
    'border-radius:6px', 'font:13px/1.5 ui-sans-serif,system-ui,sans-serif',
  ].join(';')
  ui.innerHTML =
    '<div style="font-weight:600;margin-bottom:6px">CMS sync</div>' +
    '<div data-role="msg" style="color:#4a5a51">Starting…</div>'
  document.body.appendChild(ui)
  const say = (text) => {
    const node = ui.querySelector('[data-role="msg"]')
    if (node) node.textContent = text
  }
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  const boardOrigin = location.origin
  const deepLink = (id) => `${boardOrigin}/jobPostings#/jobPostings/${id}`

  /**
   * Company logos live in a public Azure blob container as `.../files/<tenantId>/<fileId>`. The tenant
   * id is read off an image the board already rendered rather than hardcoded, so this keeps working
   * for any 12twenty school. Returns null when no such image is on the page — logos are then skipped.
   */
  const logoBase = (() => {
    const found = Array.from(document.querySelectorAll('img'))
      .map((img) => img.src || '')
      .find((src) => /^https:\/\/[^/]+\.blob\.core\.windows\.net\/files\/\d+\//.test(src))
    const match = found && found.match(/^(https:\/\/[^/]+\.blob\.core\.windows\.net\/files\/\d+\/)/)
    return match ? match[1] : null
  })()
  const logoUrl = (fileId) => (logoBase && fileId ? `${logoBase}${fileId}` : null)

  /**
   * Collects any work-authorization text the posting carries. Field names are matched by pattern
   * rather than hardcoded because they vary by school and by 12twenty version, and because the
   * structured field is often blank anyway — the tracker treats the job description as the primary
   * signal and uses this only as a fallback.
   */
  const WORK_AUTH_KEY = /(visa|sponsor|authoriz|citizen|eligibil|clearance)/i
  function collectWorkAuth(detail) {
    const parts = []
    for (const [key, value] of Object.entries(detail || {})) {
      if (!WORK_AUTH_KEY.test(key)) continue
      if (value === null || value === undefined || value === '' || typeof value === 'object') continue
      if (typeof value === 'boolean') parts.push(`${key}: ${value ? 'yes' : 'no'}`)
      else parts.push(`${key}: ${String(value).slice(0, 200)}`)
    }
    return parts.length ? parts.join(' · ').slice(0, 800) : null
  }

  async function queryPage(pageNumber) {
    const res = await fetch(QUERY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ StatusIds: STATUS_IDS, PageSize: PAGE_SIZE, PageNumber: pageNumber }),
    })
    if (!res.ok) throw new Error(`board query failed (${res.status}) — try reloading the board and signing in again`)
    return res.json()
  }

  async function postToTracker(path, payload) {
    const res = await fetch(`${TRACKER}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`tracker ${path} failed (${res.status})`)
    return res.json()
  }

  try {
    // Phase 1 — cheap list data for every open posting. Ranking is free, so we take them all.
    const listings = []
    let pageNumber = 1
    let total = 0
    while (pageNumber <= MAX_PAGES) {
      const page = await queryPage(pageNumber)
      total = page.Total || 0
      for (const item of page.Items || []) {
        listings.push({
          externalId: String(item.Id),
          title: item.JobTitle || item.TitleDisplay || '',
          companyName: item.CompanyName || 'Unknown',
          location: item.LocationDisplay || null,
          url: deepLink(item.Id),
          postedAt: item.PostedDate || item.SubmitDate || null,
          deadline: item.ApplicationDeadlineDate || null,
          status: item.StatusName || null,
          logoUrl: logoUrl(item.CompanyLogoFileId),
        })
      }
      say(`Reading board… ${listings.length}/${total}`)
      if (listings.length >= total || !(page.Items || []).length) break
      pageNumber++
      await sleep(THROTTLE_MS)
    }

    say(`Sending ${listings.length} postings to tracker…`)
    const imported = await postToTracker('/api/import/cms/listings', { listings })

    // Phase 2 — descriptions cost one request each, so only the top-ranked shortlist gets one.
    const needDetail = imported.needDetail || []
    const details = []
    for (let index = 0; index < needDetail.length; index++) {
      const externalId = needDetail[index]
      say(`Fetching details… ${index + 1}/${needDetail.length}`)
      try {
        const res = await fetch(`/Api/V2/job-postings/${externalId}`, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) continue
        const d = await res.json()
        const html = d.Description || ''
        details.push({
          externalId: String(externalId),
          description: html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() || null,
          salaryMin: d.SalaryMin ?? null,
          salaryMax: d.SalaryMax ?? null,
          applyUrl: d.Url || null,
          department: d.JobFunctionName || null,
          employmentType: d.JobTypeName || null,
          workAuthRaw: collectWorkAuth(d),
        })
      } catch {
        // One unreadable posting shouldn't abort the sync.
      }
      await sleep(THROTTLE_MS)
    }

    let scored = 0
    if (details.length) {
      say(`Sending ${details.length} descriptions…`)
      const result = await postToTracker('/api/import/cms/details', { details })
      scored = result.scoringQueued || 0
    }

    ui.innerHTML =
      '<div style="font-weight:600;margin-bottom:6px">CMS sync complete</div>' +
      `<div style="color:#4a5a51">${imported.created} new · ${imported.updated} updated · ${details.length} detailed` +
      (scored ? ` · scoring ${scored} in background` : '') +
      '</div>' +
      `<div style="margin-top:8px"><a href="${TRACKER}/#cms" target="_blank" style="color:#0c7a61">Open tracker →</a></div>`
    setTimeout(() => ui.remove(), 20000)
  } catch (error) {
    ui.innerHTML =
      '<div style="font-weight:600;margin-bottom:6px;color:#c13434">CMS sync failed</div>' +
      `<div style="color:#4a5a51">${String((error && error.message) || error)}</div>`
    setTimeout(() => ui.remove(), 20000)
  }
})()
