import { access, mkdir, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { generatePuzzle } from './lib/generator'

interface Arguments {
  dates: string[]
  salt?: string
  missingOnly: boolean
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return isoDate(value)
}

function parseArguments(argv: string[]): Arguments {
  const value = (name: string) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const date = value('--date')
  const from = value('--from')
  const days = Number(value('--days') ?? 1)
  const through = value('--through')
  const salt = value('--salt')
  const missingOnly = argv.includes('--missing')
  if (date) return { dates: [date], salt, missingOnly }
  if (from) {
    const count = through
      ? Math.floor((Date.parse(`${through}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
      : days
    return { dates: Array.from({ length: count }, (_, index) => addDays(from, index)), salt, missingOnly }
  }
  return { dates: [isoDate(new Date())], salt, missingOnly }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  const puzzleDirectory = resolve('public/puzzles')
  const solutionDirectory = resolve('.generated/solutions')
  await mkdir(puzzleDirectory, { recursive: true })
  await mkdir(solutionDirectory, { recursive: true })

  for (const date of args.dates) {
    const puzzlePath = resolve(puzzleDirectory, `${date}.json`)
    if (args.missingOnly && await exists(puzzlePath)) {
      console.log(`${date}: already generated`)
      continue
    }
    const generated = generatePuzzle(date, { salt: args.salt })
    await writeFile(
      puzzlePath,
      `${JSON.stringify(generated.puzzle, null, 2)}\n`,
      'utf8',
    )
    await writeFile(
      resolve(solutionDirectory, `${date}.json`),
      `${JSON.stringify({
        date,
        attempts: generated.attempts,
        ...generated.metrics,
      }, null, 2)}\n`,
      'utf8',
    )
    console.log(
      `${date}: ${generated.metrics.makeCount}/${generated.metrics.totalInputs} makes, ` +
        `${(generated.metrics.forgiveness * 100).toFixed(1)}% forgiveness, ` +
        `${generated.attempts} candidate(s)`,
    )
  }

  const dates = (await readdir(puzzleDirectory))
    .map((file) => /^(\d{4}-\d{2}-\d{2})\.json$/.exec(file)?.[1])
    .filter((date): date is string => Boolean(date))
    .sort()
  await writeFile(
    resolve(puzzleDirectory, 'index.json'),
    `${JSON.stringify({ dates }, null, 2)}\n`,
    'utf8',
  )
}

await main()
