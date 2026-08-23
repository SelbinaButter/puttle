import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { PuzzleSchedule } from './lib/generator'
import type { PuzzleMetrics } from './lib/validate'

interface StoredSolution extends PuzzleMetrics, PuzzleSchedule {
  date: string
  stimp: number
}

const directory = resolve('.generated/solutions')
const files = (await readdir(directory)).filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
const solutions = await Promise.all(files.map(async (file) =>
  JSON.parse(await readFile(resolve(directory, file), 'utf8')) as StoredSolution))

function ease(solution: StoredSolution): number {
  return solution.makeWindow / 0.025 * 0.45 +
    solution.forgiveness / 0.3 * 0.35 +
    solution.secondPuttPassRate * 0.1 +
    (1 - Math.abs(solution.widestAimDegrees) / 15) * 0.1
}

const selected = new Map<string, { solution: StoredSolution; roles: string[] }>()
function select(role: string, candidates: StoredSolution[], preference: 'easy' | 'middle' | 'hard' = 'middle') {
  const available = candidates.filter((candidate) => !selected.has(candidate.date)).sort((a, b) => ease(b) - ease(a))
  const solution = preference === 'easy' ? available[0]
    : preference === 'hard' ? available.at(-1)
      : available[Math.floor(available.length / 2)]
  if (!solution) throw new Error(`No review candidate for ${role}`)
  selected.set(solution.date, { solution, roles: [role] })
}

select('Short / easier', solutions.filter((solution) => solution.distanceProfile === 'short'), 'easy')
select('Medium conventional', solutions.filter((solution) =>
  solution.distanceProfile === 'medium' && solution.contourProfile === 'conventional'))
select('Long conventional', solutions.filter((solution) =>
  solution.distanceProfile === 'long' && solution.contourProfile === 'conventional'))
select('32–36 ft showcase', solutions.filter((solution) => solution.distanceProfile === 'showcase'))
const firstDouble = solutions.filter((solution) =>
  solution.contourProfile === 'double' && !selected.has(solution.date))
  .sort((a, b) => a.bearing - b.bearing)[0]
select('Double break A', [firstDouble])
select('Double break B', solutions.filter((solution) => {
  if (solution.contourProfile !== 'double') return false
  const difference = Math.abs(solution.bearing - firstDouble.bearing)
  return Math.min(difference, 360 - difference) >= 90
}))
select('Solver easiest', solutions, 'easy')
select('Solver hardest', solutions, 'hard')

const rows = [...selected.values()].map(({ solution, roles }) => {
  const paceIndices = [...new Set(solution.makes.map((make) => make.speedIndex))].sort((a, b) => a - b)
  const paceSpan = paceIndices.length > 1 ? (paceIndices.at(-1) as number) - paceIndices[0] : 0
  return `| ${roles.join(', ')} | ${solution.date} | ${solution.distance.toFixed(1)} ft | ` +
    `${solution.bearing.toFixed(0)}° | ${solution.stimp.toFixed(1)} | ${solution.contourProfile} | ` +
    `${(solution.makeWindow * 100).toFixed(2)}% | ${solution.widestAimDegrees.toFixed(1)}° | ` +
    `${(solution.forgiveness * 100).toFixed(1)}% | ${(solution.secondPuttPassRate * 100).toFixed(0)}% | ` +
    `${(paceSpan * 0.5).toFixed(1)} ft |`
})
const markdown = `# Archive manual-review checkpoint\n\n` +
  `Play these dates through Archive mode before final tuning. “Solver easiest/hardest” uses a composite of make-window, forgiveness, required aim, and second-putt rate; it is not a distance label.\n\n` +
  `| Role | Date | Distance | Bearing | Stimp | Contour | Make window | Required aim | Forgiveness | Second-putt pass | Make pace span |\n` +
  `| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |\n` +
  `${rows.join('\n')}\n`
await mkdir(resolve('.generated'), { recursive: true })
await writeFile(resolve('.generated/manual-review.md'), markdown, 'utf8')
console.log(markdown)
