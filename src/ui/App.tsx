import { useEffect, useRef, useState } from 'react'
import {
  AIM_COUNT,
  SPEED_COUNT,
  aimDegrees,
  simulatePutt,
  speedPastFeet,
  type PathPoint,
  type PuzzleDefinition,
} from '../sim'
import { localDate, previousDate } from '../game/date'
import { archiveDateFromUrl, gameUrl, shareGameUrl } from '../game/links'
import { formatFeet, shareText } from '../game/share'
import { MAX_PUTTS } from '../game/constants'
import { canTapIn, createTapInResult } from '../game/tapIn'
import {
  hasSeenOnboarding,
  loadRound,
  loadStats,
  markOnboardingSeen,
  recordResult,
  saveRound,
} from '../game/storage'
import type { PlayedStroke, PlayerStats } from '../game/types'
import { GreenCanvas } from './GreenCanvas'

type GameMode = 'daily' | 'archive' | 'practice'

interface Animation {
  result: ReturnType<typeof simulatePutt>
  aimIndex: number
  speedIndex: number
  startTime: number
  time: number
}

interface PuzzleIndex {
  dates: string[]
}

function randomIndex(length: number): number {
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)
  return length > 0 ? value[0] % length : 0
}

export default function App() {
  const initialToday = localDate()
  const initialArchiveDate = archiveDateFromUrl(window.location.href, initialToday)
  const [today, setToday] = useState(initialToday)
  const [mode, setMode] = useState<GameMode>(initialArchiveDate ? 'archive' : 'daily')
  const [selectedDate, setSelectedDate] = useState(initialArchiveDate ?? initialToday)
  const [availableDates, setAvailableDates] = useState<string[]>([today])
  const [practiceRun, setPracticeRun] = useState(0)
  const [puzzle, setPuzzle] = useState<PuzzleDefinition>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [strokes, setStrokes] = useState<PlayedStroke[]>([])
  const [aimIndex, setAimIndex] = useState(30)
  const [speedIndex, setSpeedIndex] = useState(3)
  const [animation, setAnimation] = useState<Animation>()
  const [stats, setStats] = useState<PlayerStats>(() => loadStats())
  const [revealPaths, setRevealPaths] = useState<PathPoint[][]>([])
  const [showResult, setShowResult] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding())
  const [copied, setCopied] = useState(false)
  const [appBaseUrl] = useState(() => new URL(import.meta.env.BASE_URL, window.location.href).href)
  const frame = useRef<number>()

  useEffect(() => {
    let timer: number
    const syncDate = () => {
      const date = localDate()
      setToday(date)
      if (mode === 'daily') setSelectedDate(date)
    }
    const scheduleMidnight = () => {
      const now = new Date()
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timer = window.setTimeout(() => { syncDate(); scheduleMidnight() }, midnight.getTime() - now.getTime() + 100)
    }
    scheduleMidnight()
    window.addEventListener('focus', syncDate)
    document.addEventListener('visibilitychange', syncDate)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', syncDate)
      document.removeEventListener('visibilitychange', syncDate)
    }
  }, [mode])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${import.meta.env.BASE_URL}puzzles/index.json`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<PuzzleIndex> : { dates: [today] })
      .then((index) => {
        const dates = [...new Set(index.dates)]
          .filter((date) => date <= today)
          .sort()
        if (dates.length > 0) setAvailableDates(dates)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [today])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${import.meta.env.BASE_URL}puzzles/${selectedDate}.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`That green is not in the archive yet (${response.status}).`)
        if (!response.headers.get('content-type')?.includes('application/json')) {
          throw new Error('That green is not in the archive yet.')
        }
        return response.json() as Promise<PuzzleDefinition>
      })
      .then((nextPuzzle) => {
        setPuzzle(nextPuzzle)
        setStrokes(mode === 'practice' ? [] : loadRound(nextPuzzle.date).strokes)
        setAimIndex(30)
        setSpeedIndex(3)
        setAnimation(undefined)
        setRevealPaths([])
        setShowResult(false)
        setCopied(false)
        setLoading(false)
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
          setError(reason instanceof Error ? reason.message : 'Could not load that green.')
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, [mode, practiceRun, selectedDate])

  useEffect(() => {
    if (puzzle && mode !== 'practice') saveRound({ date: puzzle.date, strokes })
  }, [mode, puzzle, strokes])

  useEffect(() => {
    window.history.replaceState(
      null,
      '',
      gameUrl(appBaseUrl, window.location.href, mode, selectedDate),
    )
  }, [appBaseUrl, mode, selectedDate])

  const won = strokes.at(-1)?.holed ?? false
  const failed = !won && strokes.length >= MAX_PUTTS
  const finished = won || failed
  const ball = strokes.at(-1)?.final ?? puzzle?.ball

  useEffect(() => {
    if (!puzzle || !finished || revealPaths.length > 0) return
    let cancelled = false
    const solve = async () => {
      const makes: PathPoint[][] = []
      for (let aim = 0; aim < AIM_COUNT; aim += 1) {
        for (let speed = 0; speed < SPEED_COUNT; speed += 1) {
          const result = simulatePutt(puzzle, puzzle.ball, aim, speed)
          if (result.holed) makes.push(result.path)
        }
        if (aim % 4 === 3) await new Promise((resolve) => window.setTimeout(resolve, 0))
        if (cancelled) return
      }
      setRevealPaths(makes)
    }
    void solve()
    return () => {
      cancelled = true
    }
  }, [finished, puzzle, revealPaths.length])

  const beginLoad = () => {
    setLoading(true)
    setError(undefined)
  }

  const choosePracticePuzzle = () => {
    const candidates = availableDates.filter((date) => date < today)
    const pool = candidates.length > 0 ? candidates : availableDates
    const alternatives = pool.filter((date) => date !== selectedDate)
    const choices = alternatives.length > 0 ? alternatives : pool
    const randomDate = choices[randomIndex(choices.length)] ?? today
    beginLoad()
    setMode('practice')
    setSelectedDate(randomDate)
    setPracticeRun((run) => run + 1)
  }

  const changeMode = (nextMode: GameMode) => {
    if (nextMode === 'practice') {
      choosePracticePuzzle()
      return
    }
    const nextDate =
      nextMode === 'daily'
        ? today
        : availableDates.filter((date) => date < today).at(-1) ?? previousDate(today)
    beginLoad()
    setMode(nextMode)
    setSelectedDate(nextDate)
    if (nextMode === mode && nextDate === selectedDate) {
      setPracticeRun((run) => run + 1)
    }
  }

  const moveArchive = (direction: -1 | 1) => {
    const currentIndex = availableDates.indexOf(selectedDate)
    const nextIndex = Math.max(0, Math.min(availableDates.length - 1, currentIndex + direction))
    beginLoad()
    setSelectedDate(availableDates[nextIndex])
  }

  const rollStroke = (result: ReturnType<typeof simulatePutt>) => {
    if (!puzzle || !ball || animation || finished) return
    const started = performance.now()
    const nextAnimation: Animation = { result, aimIndex, speedIndex, startTime: started, time: 0 }
    setAnimation(nextAnimation)
    const tick = (now: number) => {
      const time = Math.min(result.elapsed, ((now - started) / 1000) * 1.45)
      setAnimation({ ...nextAnimation, time })
      if (time < result.elapsed) {
        frame.current = requestAnimationFrame(tick)
        return
      }
      const stroke: PlayedStroke = {
        aimIndex,
        speedIndex,
        start: { ...ball },
        final: result.final,
        finalDistance: result.finalDistance,
        holed: result.holed,
        lipOut: result.lipOut,
        elapsed: result.elapsed,
        path: result.path,
      }
      setStrokes((current) => {
        const next = [...current, stroke]
        if (stroke.holed || next.length >= MAX_PUTTS) {
          setShowResult(true)
          if (mode === 'daily') {
            setStats(recordResult(
              puzzle.date,
              puzzle.number,
              stroke.holed ? next.length : null,
            ))
          }
        }
        return next
      })
      setAnimation(undefined)
    }
    frame.current = requestAnimationFrame(tick)
  }

  const startPutt = () => {
    if (!puzzle || !ball || animation || finished) return
    rollStroke(simulatePutt(puzzle, ball, aimIndex, speedIndex))
  }

  const tapIn = () => {
    if (!puzzle || !ball || animation || finished) return
    const result = createTapInResult(ball, puzzle.hole)
    if (result) rollStroke(result)
  }

  useEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    },
    [],
  )

  const copyResult = async () => {
    if (!puzzle) return
    const shareUrl = shareGameUrl(
      appBaseUrl,
      window.location.href,
      mode,
      puzzle.date,
    )
    const text = shareText(puzzle, strokes, { mode, url: shareUrl })
    if (navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
      }
    }
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const archiveIndex = availableDates.indexOf(selectedDate)
  const solvingReveal = finished && revealPaths.length === 0
  const lastStroke = strokes.at(-1)
  const distance = puzzle && ball
    ? Math.sqrt((puzzle.hole.x - ball.x) ** 2 + (puzzle.hole.y - ball.y) ** 2)
    : 0
  const tapInAvailable = Boolean(puzzle && ball && canTapIn(ball, puzzle.hole))
  const modeLabel = mode === 'daily' ? 'Daily puzzle' : mode === 'archive' ? 'Archive' : 'Practice'

  const closeOnboarding = () => {
    markOnboardingSeen()
    setShowOnboarding(false)
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">{modeLabel}{puzzle ? ` · #${puzzle.number}` : ''}</span>
          <h1>Puttle</h1>
        </div>
        <div className="header-stats" aria-label="Player streak">
          <span><b>{stats.currentStreak}</b> streak</span>
          <span><b>{stats.history.length}</b> played</span>
        </div>
      </header>

      <nav className="mode-tabs" aria-label="Game mode">
        {(['daily', 'archive', 'practice'] as const).map((tab) => (
          <button
            type="button"
            className={mode === tab ? 'active' : ''}
            aria-pressed={mode === tab}
            onClick={() => changeMode(tab)}
            key={tab}
          >
            {tab === 'daily' ? 'Today' : tab === 'archive' ? 'Archive' : 'Practice'}
          </button>
        ))}
      </nav>

      {mode === 'archive' && (
        <div className="mode-panel archive-picker">
          <button type="button" aria-label="Previous archived green" disabled={archiveIndex <= 0} onClick={() => moveArchive(-1)}>←</button>
          <label>
            <span>Archived green</span>
            <select value={selectedDate} onChange={(event) => { beginLoad(); setSelectedDate(event.target.value) }}>
              {availableDates.filter((date) => date < today).map((date) => (
                <option value={date} key={date}>{date}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            aria-label="Next archived green"
            disabled={archiveIndex < 0 || archiveIndex >= availableDates.length - 2}
            onClick={() => moveArchive(1)}
          >→</button>
        </div>
      )}

      {mode === 'practice' && (
        <div className="mode-panel practice-panel">
          <span>Random archived green · doesn’t affect your daily streak</span>
          <button type="button" onClick={choosePracticePuzzle}>New random green</button>
        </div>
      )}

      {error ? (
        <div className="error-card">
          <span className="eyebrow">Green unavailable</span>
          <h2>That putt isn’t ready.</h2>
          <p>{error}</p>
          <button type="button" onClick={() => changeMode('daily')}>Return to today</button>
        </div>
      ) : loading || !puzzle || !ball ? (
        <div className="loader game-loader">Reading the green…</div>
      ) : (
        <section className="game-card">
          <div className="readout-row">
            <span><i className="status-dot" /> {formatFeet(distance)} to cup</span>
            <span title="Stimpmeter green-speed rating. Higher numbers roll faster and farther.">
              Green speed · {puzzle.stimp.toFixed(1)} Stimp
            </span>
            {finished && !showResult ? (
              <button className="result-reopen" type="button" onClick={() => setShowResult(true)}>View result</button>
            ) : (
              <span>Putt {finished ? strokes.length : strokes.length + 1}/{MAX_PUTTS}</span>
            )}
          </div>
          <div className="canvas-wrap">
            <GreenCanvas
              key={`${mode}:${puzzle.date}:${practiceRun}`}
              puzzle={puzzle}
              strokes={strokes}
              ball={ball}
              aimIndex={aimIndex}
              speedIndex={speedIndex}
              activePath={animation?.result.path}
              animationTime={animation?.time}
              revealPaths={revealPaths}
              revealed={finished}
            />
            {finished && showResult && (
              <div className="win-card" role="dialog" aria-label="Puzzle result">
                <button className="win-close" type="button" aria-label="Close result" onClick={() => setShowResult(false)}>×</button>
                <span className="eyebrow">{won ? 'Holed' : 'Round complete'}</span>
                <strong>{won ? `${strokes.length}/${MAX_PUTTS}` : `X/${MAX_PUTTS}`}</strong>
                <span className="muted">
                  {solvingReveal
                    ? 'Mapping the make window…'
                    : won
                      ? `${revealPaths.length} opening lines went in`
                      : `The cup won this one · ${revealPaths.length} lines were open`}
                </span>
                <button type="button" onClick={() => void copyResult()}>{copied ? 'Copied!' : 'Share result'}</button>
                <button className="text-button" type="button" onClick={() => setShowResult(false)}>View green</button>
              </div>
            )}
          </div>

          {!finished && strokes.length === 0 && (
            <div className="first-read">
              <b>Your first putt is the read.</b> No slope clue is shown yet. Start near straight,
              choose how far past the cup the ball would roll on a flat green, then use its trace
              to adjust. Higher Stimp means a faster green.
            </div>
          )}

          {!finished && lastStroke && (
            <div className={`stroke-feedback ${lastStroke.lipOut ? 'lip-out' : ''}`} role="status">
              <b>{lastStroke.lipOut ? 'Lipped out — too firm.' : `${formatFeet(lastStroke.finalDistance)} remains.`}</b>
              <span>
                {tapInAvailable
                  ? 'Aim and speed are locked. Tap it in.'
                  : lastStroke.lipOut
                    ? `${formatFeet(lastStroke.finalDistance)} remains.`
                    : 'Use the trace for your next read.'}
              </span>
            </div>
          )}

          {finished && !showResult ? (
            <div className="result-panel">
              <div>
                <span className="eyebrow">{won ? 'Holed · Green revealed' : 'Five putts · Green revealed'}</span>
                <strong>{won ? `${strokes.length}/${MAX_PUTTS}` : `X/${MAX_PUTTS}`}</strong>
                <span className="muted">
                  {solvingReveal
                    ? 'Mapping the make window…'
                    : `${revealPaths.length} opening lines went in`}
                </span>
              </div>
              <div className="result-actions">
                {mode === 'practice' ? (
                  <button className="secondary-button" type="button" onClick={choosePracticePuzzle}>New green</button>
                ) : (
                  <>
                    {mode !== 'archive' && <button className="secondary-button" type="button" onClick={() => changeMode('archive')}>Archive</button>}
                    <button className="secondary-button" type="button" onClick={choosePracticePuzzle}>Practice</button>
                  </>
                )}
                <button type="button" onClick={() => void copyResult()}>{copied ? 'Copied!' : 'Share result'}</button>
              </div>
            </div>
          ) : !finished ? (
            <div className="controls" aria-label="Putt controls">
              <label>
                <span><b>Aim</b><output>{aimDegrees(aimIndex) > 0 ? '+' : ''}{aimDegrees(aimIndex).toFixed(1)}°</output></span>
                <input type="range" min="0" max={AIM_COUNT - 1} step="1" value={aimIndex} disabled={Boolean(animation) || tapInAvailable} onChange={(event) => setAimIndex(Number(event.target.value))} />
                <small><span>15° left</span><span>Straight</span><span>15° right</span></small>
              </label>
              <label>
                <span><b>Speed</b><output>{speedPastFeet(speedIndex).toFixed(1)} ft past</output></span>
                <input type="range" min="0" max={SPEED_COUNT - 1} step="1" value={speedIndex} disabled={Boolean(animation) || tapInAvailable} onChange={(event) => setSpeedIndex(Number(event.target.value))} />
                <small><span>Die it</span><span>Firm</span></small>
              </label>
              <div className="stroke-actions">
                {tapInAvailable ? (
                  <button className="tap-in-button" type="button" disabled={Boolean(animation)} onClick={tapIn}>
                    Tap in
                  </button>
                ) : (
                  <button className="putt-button" type="button" disabled={Boolean(animation)} onClick={startPutt}>
                    {animation ? 'Rolling…' : 'Putt'}
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </section>
      )}

      <footer>
        The slope stays hidden until the round ends. Every trace is part of your read. · Local date {selectedDate}
      </footer>

      {showOnboarding && (
        <div className="intro-backdrop">
          <section className="intro-card" role="dialog" aria-modal="true" aria-labelledby="intro-title">
            <span className="eyebrow">How to play</span>
            <h2 id="intro-title">Read it. Roll it. Hole it.</h2>
            <ol>
              <li><b>1</b><span><strong>Choose your line</strong>Aim left or right and set how firmly the ball should pass the cup.</span></li>
              <li><b>2</b><span><strong>Read the trace</strong>The slope is hidden. Every curve and stopping point is your clue.</span></li>
              <li><b>3</b><span><strong>Finish in five</strong>Inside one foot, Tap in safely adds your final stroke. Hole out within five, then share.</span></li>
            </ol>
            <button type="button" onClick={closeOnboarding}>Play today’s green</button>
          </section>
        </div>
      )}
    </main>
  )
}
