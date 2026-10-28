// Regenerates assets/github-stats.svg from live GitHub data, private repos included.
// Needs the GitHub CLI logged in as the profile owner:  node scripts/stats.mjs
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const gql = (query) =>
  JSON.parse(execFileSync('gh', ['api', 'graphql', '-f', `query=${query}`], { encoding: 'utf8', windowsHide: true }))

const repos = []
let after = null
do {
  const page = gql(`{viewer{repositories(first:50${after ? `,after:"${after}"` : ''},ownerAffiliations:OWNER,isFork:false){
    pageInfo{hasNextPage endCursor} nodes{languages(first:30){edges{size node{name color}}}}}}}`).data.viewer.repositories
  repos.push(...page.nodes)
  after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
} while (after)

const calendar = gql(
  '{viewer{contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}}}',
).data.viewer.contributionsCollection.contributionCalendar
const contributions = calendar.totalContributions

const bytes = new Map()
for (const repo of repos)
  for (const { size, node } of repo.languages.edges) {
    const cur = bytes.get(node.name) ?? { size: 0, color: node.color ?? '#8b949e' }
    cur.size += size
    bytes.set(node.name, cur)
  }
const total = [...bytes.values()].reduce((sum, l) => sum + l.size, 0)
const sorted = [...bytes].sort((a, b) => b[1].size - a[1].size)
const top = sorted.slice(0, 7).map(([name, l]) => ({ name, color: l.color, share: l.size / total }))
top.push({ name: 'Other', color: '#8b949e', share: 1 - top.reduce((sum, l) => sum + l.share, 0) })

const fmt = (n) => n.toLocaleString('en-US')
const pct = (s) => (s < 0.01 ? '<1' : Math.round(s * 100)) + '%'
const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const BAR_X = 24, BAR_W = 447
let x = BAR_X
const bar = top
  .map((l) => {
    const w = l.share * BAR_W
    const rect = `<rect x="${x.toFixed(1)}" y="150" width="${w.toFixed(1)}" height="10" fill="${l.color}"/>`
    x += w
    return rect
  })
  .join('\n    ')
const legend = top
  .map((l, i) => {
    const cx = 28 + (i % 4) * 118, cy = 190 + Math.floor(i / 4) * 24
    return `<circle cx="${cx}" cy="${cy}" r="4" fill="${l.color}"/><text x="${cx + 10}" y="${cy + 4}">${l.name} <tspan fill="#8b949e">${pct(l.share)}</tspan></text>`
  })
  .join('\n    ')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="250" viewBox="0 0 495 250" role="img" aria-label="GitHub stats, private repositories included">
  <title>Jiří Hyan — GitHub stats, private repositories included (${date})</title>
  <rect x="0.5" y="0.5" width="494" height="249" rx="12" fill="#0d1117" stroke="#30363d"/>
  <g font-family="Segoe UI, Helvetica, Arial, sans-serif">
    <text x="24" y="40" font-size="15" font-weight="600" fill="#e6edf3">GitHub stats</text>
    <text x="471" y="40" font-size="11" fill="#8b949e" text-anchor="end">incl. private · ${date}</text>
    <text x="24" y="88" font-size="26" font-weight="700" fill="#e6edf3">${repos.length}</text>
    <text x="24" y="106" font-size="11" fill="#8b949e">Repositories</text>
    <text x="190" y="88" font-size="26" font-weight="700" fill="#e6edf3">${fmt(contributions)}</text>
    <text x="190" y="106" font-size="11" fill="#8b949e">Contributions · last 12 months</text>
    <text x="392" y="88" font-size="26" font-weight="700" fill="#e6edf3">${bytes.size}</text>
    <text x="392" y="106" font-size="11" fill="#8b949e">Languages</text>
    <text x="24" y="138" font-size="11" fill="#8b949e">Language mix (by code size)</text>
  </g>
  <clipPath id="bar"><rect x="${BAR_X}" y="150" width="${BAR_W}" height="10" rx="5"/></clipPath>
  <g clip-path="url(#bar)">
    ${bar}
  </g>
  <g font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="11" fill="#c9d1d9">
    ${legend}
  </g>
</svg>
`
writeFileSync(new URL('../assets/github-stats.svg', import.meta.url), svg)

// Weekly contributions over the same 12 months, as an area chart, from the first active week on.
const allWeeks = calendar.weeks.map((w) => ({
  start: w.contributionDays[0].date,
  count: w.contributionDays.reduce((sum, d) => sum + d.contributionCount, 0),
}))
const firstActive = Math.max(0, allWeeks.findIndex((w) => w.count > 0) - 1)
const weeks = allWeeks.slice(firstActive)
const since = new Date(weeks[0].start + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const W = 880, H = 220, L = 48, R = 16, T = 44, B = 32
const max = Math.max(1, ...weeks.map((w) => w.count))
const niceMax = (() => {
  const step = 10 ** Math.floor(Math.log10(max))
  return Math.ceil(max / step) * step
})()
const px = (i) => L + (i * (W - L - R)) / (weeks.length - 1)
const py = (v) => T + (H - T - B) * (1 - v / niceMax)
const line = weeks.map((w, i) => `${px(i).toFixed(1)},${py(w.count).toFixed(1)}`).join(' ')
const area = `${px(0).toFixed(1)},${py(0)} ${line} ${px(weeks.length - 1).toFixed(1)},${py(0)}`
const gridLines = [0, 0.5, 1]
  .map((f) => {
    const v = Math.round(niceMax * f), y = py(v).toFixed(1)
    return `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#21262d"/><text x="${L - 8}" y="${+y + 4}" text-anchor="end">${fmt(v)}</text>`
  })
  .join('\n    ')
const months = weeks
  .map((w, i) => ({ i, d: new Date(w.start + 'T00:00:00Z') }))
  .filter(({ i, d }, k, all) => k > 0 && d.getUTCMonth() !== all[k - 1].d.getUTCMonth())
  .map(({ i, d }) => `<text x="${px(i).toFixed(1)}" y="${H - 10}" text-anchor="middle">${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</text>`)
  .join('\n    ')
const peak = weeks.reduce((a, b) => (b.count > a.count ? b : a))

const activity = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Contributions per week since ${since}">
  <title>Contributions per week since ${since}, private repositories included (${date}). Peak ${fmt(peak.count)} in the week of ${peak.start}.</title>
  <defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fb950" stop-opacity="0.45"/><stop offset="1" stop-color="#3fb950" stop-opacity="0"/></linearGradient></defs>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="#0d1117" stroke="#30363d"/>
  <g font-family="Segoe UI, Helvetica, Arial, sans-serif">
    <text x="24" y="28" font-size="15" font-weight="600" fill="#e6edf3">Contributions per week</text>
    <text x="${W - 24}" y="28" font-size="11" fill="#8b949e" text-anchor="end">since ${since} · incl. private · ${date}</text>
  </g>
  <g font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="10" fill="#8b949e">
    ${gridLines}
    ${months}
  </g>
  <polygon points="${area}" fill="url(#fill)"/>
  <polyline points="${line}" fill="none" stroke="#3fb950" stroke-width="2" stroke-linejoin="round"/>
</svg>
`
writeFileSync(new URL('../assets/activity.svg', import.meta.url), activity)
console.log(`repos ${repos.length} · contributions ${contributions} · languages ${bytes.size} · peak week ${peak.start} = ${peak.count}`)
