import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  AIM_COUNT,
  SPEED_COUNT,
  aimDegrees,
  simulatePutt,
  simulateRoll,
  speedPastFeet,
  type PuzzleDefinition,
  type PuzzleSolution,
  type PuttResult,
} from '../sim'
import { BRAND } from '../game/brand'
import { MAX_PUTTS } from '../game/constants'
import { localDate, previousDate } from '../game/date'
import { describeMiss } from '../game/feedback'
import { archiveDateFromUrl, gameUrl, shareGameUrl } from '../game/links'
import { formatFeet, shareText } from '../game/share'
import {
  hasSeenOnboarding,
  loadRound,
  loadStats,
  markOnboardingSeen,
  recordResult,
  saveRound,
} from '../game/storage'
import { canTapIn, createTapInResult } from '../game/tapIn'
import type { PlayedStroke, PlayerStats } from '../game/types'
import { GreenCanvas } from './GreenCanvas'

type GameMode = 'daily' | 'archive' | 'practice'

interface Animation {
  kind: 'approach' | 'putt'
  result: PuttResult
  aimIndex?: number
  speedIndex?: number
  startTime: number
  time: number
}

interface PuzzleIndex {
  dates: string[]
}

interface TooltipPosition {
  arrowLeft: number
  left: number
  top: number
  width: number
}

function StimpReadout({ stimp }: { stimp: number }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<TooltipPosition>()

  useLayoutEffect(() => {
    if (!open) return

    const placeTooltip = () => {
      const button = buttonRef.current
      if (!button) return
      const buttonBounds = button.getBoundingClientRect()
      const width = Math.min(310, window.innerWidth - 32)
      const anchorCenter = buttonBounds.left + buttonBounds.width / 2
      const left = Math.min(
        window.innerWidth - 16 - width / 2,
        Math.max(16 + width / 2, anchorCenter),
      )
      setPosition({
        arrowLeft: anchorCenter - (left - width / 2),
        left,
        top: buttonBounds.bottom + 10,
        width,
      })
    }

    placeTooltip()
    window.addEventListener('resize', placeTooltip)
    window.addEventListener('scroll', placeTooltip, true)
    return () => {
      window.removeEventListener('resize', placeTooltip)
      window.removeEventListener('scroll', placeTooltip, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!buttonRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <span className="stimp-readout">
      <span>Green speed · {stimp.toFixed(1)}</span>
      <button
        ref={buttonRef}
        className="stimp-term"
        type="button"
        aria-label="What is Stimp?"
        aria-describedby={open ? 'stimp-tooltip' : undefined}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => { if (document.activeElement !== buttonRef.current) setOpen(false) }}
      >Stimp</button>
      {open && position && createPortal(
        <span
          className="stimp-tooltip"
          id="stimp-tooltip"
          role="tooltip"
          style={{ left: position.left, top: position.top, width: position.width }}
        >
          <span className="stimp-tooltip-arrow" style={{ left: position.arrowLeft }} aria-hidden="true" />
          Stimp is the distance, in feet, a ball rolls on a level green when released from a standard Stimpmeter. A 10.0 reading means about 10 feet in that test; higher numbers are faster, so putts roll farther and feel more influence from the slope.
        </span>,
        document.body,
      )}
    </span>
  )
}

function randomIndex(length: number): number {
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)
  return length > 0 ? value[0] % length : 0
}

function midnightCountdown(): string {
  const now = new Date()
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const seconds = Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, '0')).join(':')
}

function localClock(): string {
  const now = new Date()
  return [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

function speedLabel(index: number): string {
  const feet = speedPastFeet(index)
  return feet < 0 ? `${Math.abs(feet).toFixed(1)} ft short` : `${feet.toFixed(1)} ft past`
}

function idealLabel(solution?: PuzzleSolution): string | undefined {
  if (!solution?.ideal) return undefined
  const degrees = aimDegrees(solution.ideal.aimIndex)
  const line = degrees === 0
    ? 'straight'
    : `${Math.abs(degrees).toFixed(1)}\u00b0 ${degrees < 0 ? 'left' : 'right'}`
  return `A makeable line: ${line}, ${speedLabel(solution.ideal.speedIndex)}`
}

function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="21.5" fill="currentColor" />
      <circle cx="24" cy="24" r="5.5" fill="var(--mark-hole, #f4f0e6)" />
      <path d="M4 34.5C13.5 34.5 16 14 28 14c6.2 0 10.1 4.2 15.8 4.2" fill="none" stroke="var(--mark-line, #dff15d)" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="4.8" cy="34.5" r="3.2" fill="var(--mark-line, #dff15d)" />
    </svg>
  )
}

function StatGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 16V9.5M8 16V4M13 16v-7M18 16V6.5" />
    </svg>
  )
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
  const [approachResult, setApproachResult] = useState<PuttResult>()
  const [introPending, setIntroPending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [strokes, setStrokes] = useState<PlayedStroke[]>([])
  const [aimIndex, setAimIndex] = useState(30)
  const [speedIndex, setSpeedIndex] = useState(10)
  const [animation, setAnimation] = useState<Animation>()
  const [stats, setStats] = useState<PlayerStats>(() => loadStats())
  const [solution, setSolution] = useState<PuzzleSolution>()
  const [showResult, setShowResult] = useState(false)
  const [showSolution, setShowSolution] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding())
  const [copied, setCopied] = useState(false)
  const [countdown, setCountdown] = useState(midnightCountdown)
  const [localTime, setLocalTime] = useState(localClock)
  const [appBaseUrl] = useState(() => new URL(import.meta.env.BASE_URL, window.location.href).href)
  const frame = useRef<number>()

  useEffect(() => {
    let midnightTimer: number
    const syncDate = () => {
      const date = localDate()
      setToday(date)
      if (mode === 'daily') setSelectedDate(date)
    }
    const scheduleMidnight = () => {
      const now = new Date()
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      midnightTimer = window.setTimeout(() => {
        syncDate()
        scheduleMidnight()
      }, midnight.getTime() - now.getTime() + 100)
    }
    scheduleMidnight()
    window.addEventListener('focus', syncDate)
    document.addEventListener('visibilitychange', syncDate)
    return () => {
      window.clearTimeout(midnightTimer)
      window.removeEventListener('focus', syncDate)
      document.removeEventListener('visibilitychange', syncDate)
    }
  }, [mode])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdown(midnightCountdown())
      setLocalTime(localClock())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${import.meta.env.BASE_URL}puzzles/index.json`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<PuzzleIndex> : { dates: [today] })
      .then((index) => {
        const dates = [...new Set(index.dates)].filter((date) => date <= today).sort()
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
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('That green is not in the archive yet.')
        return response.json() as Promise<PuzzleDefinition>
      })
      .then((nextPuzzle) => {
        if (nextPuzzle.version !== 2 || !nextPuzzle.approach) throw new Error('That green uses an obsolete puzzle format.')
        const savedStrokes = mode === 'practice' ? [] : loadRound(nextPuzzle).strokes
        setPuzzle(nextPuzzle)
        setApproachResult(simulateRoll(nextPuzzle, nextPuzzle.approach.from, nextPuzzle.approach.velocity))
        setStrokes(savedStrokes)
        setIntroPending(savedStrokes.length === 0)
        setAimIndex(30)
        setSpeedIndex(10)
        setAnimation(undefined)
        setSolution(undefined)
        setShowResult(false)
        setShowSolution(false)
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
    if (puzzle && mode !== 'practice') saveRound(puzzle, strokes)
  }, [mode, puzzle, strokes])

  useEffect(() => {
    window.history.replaceState(null, '', gameUrl(appBaseUrl, window.location.href, mode, selectedDate))
  }, [appBaseUrl, mode, selectedDate])

  const won = strokes.at(-1)?.holed ?? false
  const failed = !won && strokes.length >= MAX_PUTTS
  const finished = won || failed
  const ball = strokes.at(-1)?.final ?? puzzle?.ball

  useEffect(() => {
    if (!puzzle || !finished || solution) return
    const worker = new Worker(new URL('../sim/solve.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<PuzzleSolution>) => setSolution(event.data)
    worker.postMessage(puzzle)
    return () => worker.terminate()
  }, [finished, puzzle, solution])

  const beginLoad = () => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current)
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
    const nextDate = nextMode === 'daily' ? today : availableDates.filter((date) => date < today).at(-1) ?? previousDate(today)
    beginLoad()
    setMode(nextMode)
    setSelectedDate(nextDate)
    if (nextMode === mode && nextDate === selectedDate) setPracticeRun((run) => run + 1)
  }

  const moveArchive = (direction: -1 | 1) => {
    const currentIndex = availableDates.indexOf(selectedDate)
    const nextIndex = Math.max(0, Math.min(availableDates.length - 1, currentIndex + direction))
    beginLoad()
    setSelectedDate(availableDates[nextIndex])
  }

  const playApproach = () => {
    if (!approachResult || animation) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIntroPending(false)
      return
    }
    const started = performance.now()
    const nextAnimation: Animation = { kind: 'approach', result: approachResult, startTime: started, time: 0 }
    setAnimation(nextAnimation)
    const tick = (now: number) => {
      const time = Math.min(approachResult.elapsed, ((now - started) / 1000) * 1.45)
      setAnimation({ ...nextAnimation, time })
      if (time < approachResult.elapsed) frame.current = requestAnimationFrame(tick)
      else {
        setAnimation(undefined)
        setIntroPending(false)
      }
    }
    frame.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    if (!introPending || showOnboarding || !approachResult || animation) return
    const timer = window.setTimeout(playApproach, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approachResult, showOnboarding, introPending])

  const rollStroke = (result: PuttResult) => {
    if (!puzzle || !ball || animation || finished || introPending) return
    const started = performance.now()
    const nextAnimation: Animation = { kind: 'putt', result, aimIndex, speedIndex, startTime: started, time: 0 }
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
          if (mode === 'daily') setStats(recordResult(puzzle.date, puzzle.number, stroke.holed ? next.length : null))
        }
        return next
      })
      setAnimation(undefined)
    }
    frame.current = requestAnimationFrame(tick)
  }

  const startPutt = () => {
    if (!puzzle || !ball || animation || finished || introPending) return
    rollStroke(simulatePutt(puzzle, ball, aimIndex, speedIndex))
  }

  const tapIn = () => {
    if (!puzzle || !ball || animation || finished || introPending) return
    const result = createTapInResult(ball, puzzle.hole)
    if (result) rollStroke(result)
  }

  useEffect(() => () => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current)
  }, [])

  const copyResult = async () => {
    if (!puzzle) return
    const shareUrl = shareGameUrl(appBaseUrl, window.location.href, mode, puzzle.date)
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
  const solvingReveal = finished && !solution
  const lastStroke = strokes.at(-1)
  const distance = puzzle && ball ? Math.sqrt((puzzle.hole.x - ball.x) ** 2 + (puzzle.hole.y - ball.y) ** 2) : 0
  const tapInAvailable = Boolean(puzzle && ball && canTapIn(ball, puzzle.hole))
  const modeLabel = mode === 'daily' ? 'Daily puzzle' : mode === 'archive' ? 'Archive' : 'Practice'
  const controlsDisabled = Boolean(animation) || introPending
  const completedGames = stats.history.length
  const wins = stats.history.filter((entry) => entry.strokes !== null).length
  const winPercent = completedGames === 0 ? 0 : Math.round((wins / completedGames) * 100)
  const distributionKeys = ['1', '2', '3', '4', '5', 'X']
  const maximumDistribution = Math.max(1, ...distributionKeys.map((key) => stats.distribution[key] ?? 0))
  const lineLabel = idealLabel(solution)

  const closeOnboarding = () => {
    markOnboardingSeen()
    setShowOnboarding(false)
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-lockup">
          <BrandMark className="brand-mark" />
          <div className="brand-copy">
            <h1>{BRAND.displayTitle}</h1>
            <span className="brand-rule" aria-hidden="true" />
            <span className="brand-edition">Daily green<br />No. {puzzle?.number ?? '---'}</span>
          </div>
        </div>
        <button className="stats-button" type="button" onClick={() => setShowStats(true)} aria-label="View statistics">
          <StatGlyph />
          <span className="stats-copy"><b>{stats.currentStreak}</b> streak <i /> <b>{stats.history.length}</b> played</span>
        </button>
      </header>

      <div className={`mode-switcher ${mode !== 'daily' ? 'with-mode-action' : ''}`}>
        <div className="mode-heading">
          <span className="eyebrow"><i className="live-dot" />{modeLabel}{puzzle ? ` \u00b7 #${puzzle.number}` : ''}</span>
          <nav className="mode-tabs" aria-label="Game mode">
            {(['daily', 'archive', 'practice'] as const).map((tab) => (
              <button type="button" className={mode === tab ? 'active' : ''} aria-pressed={mode === tab} onClick={() => changeMode(tab)} key={tab}>
                {tab === 'daily' ? 'Today' : tab === 'archive' ? 'Archive' : 'Practice'}
              </button>
            ))}
          </nav>
        </div>

        {mode === 'archive' && (
          <div className="mode-panel archive-picker">
            <button type="button" aria-label="Previous archived green" disabled={archiveIndex <= 0} onClick={() => moveArchive(-1)}>←</button>
            <label><span>Archived green</span><select aria-label="Archived green" value={selectedDate} onChange={(event) => { beginLoad(); setSelectedDate(event.target.value) }}>{availableDates.filter((date) => date < today).map((date) => <option value={date} key={date}>{date}</option>)}</select></label>
            <button type="button" aria-label="Next archived green" disabled={archiveIndex < 0 || archiveIndex >= availableDates.length - 2} onClick={() => moveArchive(1)}>→</button>
          </div>
        )}

        {mode === 'practice' && <div className="mode-panel practice-panel"><span>Random archived green · doesn't affect your daily streak</span><button type="button" onClick={choosePracticePuzzle}>New random green</button></div>}
      </div>

      {error ? (
        <div className="error-card"><span className="eyebrow">Green unavailable</span><h2>That putt isn't ready.</h2><p>{error}</p><button type="button" onClick={() => changeMode('daily')}>Return to today</button></div>
      ) : loading || !puzzle || !ball || !approachResult ? (
        <div className="loader game-loader">Reading the green...</div>
      ) : (
        <section className="game-card">
          <div className="readout-row">
            <span className="readout-distance"><i aria-hidden="true" />{formatFeet(distance)} <small>to cup</small></span>
            <StimpReadout stimp={puzzle.stimp} />
            <div className="readout-actions">
              {strokes.length === 0 && !finished && <button className="result-reopen approach-replay" type="button" disabled={animation?.kind === 'approach'} onClick={playApproach}>Watch approach again</button>}
              {finished && !showResult ? <button className="result-reopen readout-status" type="button" onClick={() => setShowResult(true)}>View result</button> : <span className="readout-status">Putt {finished ? strokes.length : strokes.length + 1}/{MAX_PUTTS}</span>}
            </div>
          </div>
          <div className="canvas-wrap">
            <GreenCanvas
              key={`${mode}:${puzzle.date}:${practiceRun}`}
              puzzle={puzzle}
              strokes={strokes}
              ball={ball}
              aimIndex={aimIndex}
              speedIndex={speedIndex}
              aimEnabled={!finished && !controlsDisabled && !tapInAvailable}
              onAimIndexChange={setAimIndex}
              onSpeedIndexChange={setSpeedIndex}
              approachPath={approachResult.path}
              approachTrailUntil={introPending ? (animation?.kind === 'approach' ? animation.time : 0) : undefined}
              animationKind={animation?.kind}
              activePath={animation?.result.path}
              animationTime={animation?.time}
              revealPaths={[]}
              idealPath={showSolution ? solution?.ideal?.path : undefined}
              idealLabel={showSolution ? lineLabel : undefined}
              revealed={finished}
            />
            {finished && showResult && (
              <div className="win-card" role="dialog" aria-modal="true" aria-label="Puzzle result">
                <button className="win-close" type="button" aria-label="Close result" onClick={() => setShowResult(false)}>×</button>
                <span className="eyebrow">{won ? 'Holed' : 'Round complete'}</span>
                <strong>{won ? `${strokes.length}/${MAX_PUTTS}` : `X/${MAX_PUTTS}`}</strong>
                <span className="muted">Green revealed. Review your putts.</span>
                {mode === 'daily' && <span className="countdown">Next green in {countdown}</span>}
                <button type="button" onClick={() => void copyResult()}>{copied ? 'Copied!' : 'Share result'}</button>
                <button className="text-button" type="button" onClick={() => setShowResult(false)}>View green</button>
              </div>
            )}
          </div>

          {!finished && strokes.length === 0 && <div className="first-read"><b>Read the break from the approach.</b></div>}

          {!finished && lastStroke && (
            <div className={`stroke-feedback ${lastStroke.lipOut ? 'lip-out' : ''}`} role="status">
              <b>{lastStroke.holed ? 'Holed.' : describeMiss(puzzle, lastStroke)}</b>
              <span>{tapInAvailable ? 'Aim and speed are locked. Tap it in.' : lastStroke.lipOut ? `${formatFeet(lastStroke.finalDistance)} remains after the lip-out.` : 'Use the trace for your next read.'}</span>
            </div>
          )}

          {finished ? (
            <div className={`result-panel ${showResult ? 'behind-result' : ''}`} aria-hidden={showResult || undefined}>
              <div>
                <span className="eyebrow">{won ? 'Holed \u00b7 Green revealed' : 'Five putts \u00b7 Green revealed'}</span>
                <strong>{won ? `${strokes.length}/${MAX_PUTTS}` : `X/${MAX_PUTTS}`}</strong>
                <span className="muted">{showSolution ? lineLabel : 'Review your putts on the green.'}</span>
                {mode === 'daily' && <span className="countdown">Next green in {countdown}</span>}
              </div>
              <div className="result-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={showResult || !solution?.ideal}
                  aria-pressed={showSolution}
                  onClick={() => setShowSolution((visible) => !visible)}
                >
                  {showSolution ? 'Hide solution line' : solvingReveal ? 'Finding a line…' : solution?.ideal ? 'Show a makeable line' : 'No solution found'}
                </button>
                {mode === 'practice' ? <button className="secondary-button result-nav-action" type="button" disabled={showResult} onClick={choosePracticePuzzle}>New green</button> : <>{mode !== 'archive' && <button className="secondary-button result-nav-action" type="button" disabled={showResult} onClick={() => changeMode('archive')}>Archive</button>}<button className="secondary-button result-nav-action" type="button" disabled={showResult} onClick={choosePracticePuzzle}>Practice</button></>}
                <button type="button" disabled={showResult} onClick={() => void copyResult()}>{copied ? 'Copied!' : 'Share result'}</button>
              </div>
            </div>
          ) : !finished ? (
            <div className="controls" aria-label="Putt controls">
              <label>
                <span><b>Aim <i>choose your line</i></b><output>{aimDegrees(aimIndex) > 0 ? '+' : ''}{aimDegrees(aimIndex).toFixed(1)}°</output></span>
                <div className="slider-stepper"><button type="button" aria-label="Aim left one step" disabled={controlsDisabled || tapInAvailable || aimIndex === 0} onClick={() => setAimIndex((value) => value - 1)}>−</button><input style={{ '--range-progress': `${(aimIndex / (AIM_COUNT - 1)) * 100}%` } as CSSProperties} type="range" min="0" max={AIM_COUNT - 1} step="1" value={aimIndex} disabled={controlsDisabled || tapInAvailable} onChange={(event) => setAimIndex(Number(event.target.value))} /><button type="button" aria-label="Aim right one step" disabled={controlsDisabled || tapInAvailable || aimIndex === AIM_COUNT - 1} onClick={() => setAimIndex((value) => value + 1)}>+</button></div>
                <small><span>15° left</span><span>Straight</span><span>15° right</span></small>
              </label>
              <label>
                <span><b>Pace <i>flat-green finish</i></b><output>{speedLabel(speedIndex)}</output></span>
                <div className="slider-stepper"><button type="button" aria-label="Softer one step" disabled={controlsDisabled || tapInAvailable || speedIndex === 0} onClick={() => setSpeedIndex((value) => value - 1)}>−</button><input style={{ '--range-progress': `${(speedIndex / (SPEED_COUNT - 1)) * 100}%` } as CSSProperties} type="range" min="0" max={SPEED_COUNT - 1} step="1" value={speedIndex} disabled={controlsDisabled || tapInAvailable} onChange={(event) => setSpeedIndex(Number(event.target.value))} /><button type="button" aria-label="Firmer one step" disabled={controlsDisabled || tapInAvailable || speedIndex === SPEED_COUNT - 1} onClick={() => setSpeedIndex((value) => value + 1)}>+</button></div>
                <small><span>Soft</span><span>Firm</span></small>
              </label>
              <div className="stroke-actions">
                {tapInAvailable ? <button className="tap-in-button" type="button" disabled={controlsDisabled} onClick={tapIn}>Tap in <span aria-hidden="true">→</span></button> : <button className="putt-button" type="button" disabled={controlsDisabled} onClick={startPutt}><span>{animation?.kind === 'putt' ? 'Rolling...' : animation?.kind === 'approach' ? 'Reading...' : 'Putt'}</span><i aria-hidden="true">→</i></button>}
              </div>
            </div>
          ) : null}
        </section>
      )}

      <footer>
        <span className="footer-guidance">The slope stays hidden until the round ends.</span>
        {mode === 'daily' && (
          <span className="footer-local"><span className="footer-separator"> · </span>Local time {today} <span className="local-clock">{localTime}</span></span>
        )}
      </footer>

      {showOnboarding && (
        <div className="intro-backdrop"><section className="intro-card" role="dialog" aria-modal="true" aria-labelledby="intro-title"><div className="intro-brand"><BrandMark className="intro-mark" /><span>PUTTLE<br /><small>Daily green</small></span></div><span className="eyebrow">How to play</span><h2 id="intro-title">Read it. Roll it. Hole it.</h2><ol><li><b>01</b><span><strong>Watch the approach</strong>See how the ball releases across the green before your first putt.</span></li><li><b>02</b><span><strong>Choose line and pace</strong>Aim left or right, then choose whether the ball should finish short or roll past on a flat green.</span></li><li><b>03</b><span><strong>Finish in five</strong>Every trace adds information. Inside one foot, a safe tap-in adds the final stroke.</span></li></ol><button type="button" onClick={closeOnboarding}><span>Play today's green</span><i aria-hidden="true">→</i></button></section></div>
      )}

      {showStats && (
        <div className="intro-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowStats(false) }}>
          <section className="stats-card" role="dialog" aria-modal="true" aria-labelledby="stats-title">
            <button className="win-close" type="button" aria-label="Close statistics" onClick={() => setShowStats(false)}>×</button>
            <div className="stats-title-row"><BrandMark className="stats-mark" /><div><span className="eyebrow">Your record</span><h2 id="stats-title">Statistics</h2></div></div>
            <div className="stats-summary"><span><b>{completedGames}</b>Played</span><span><b>{winPercent}</b>Win %</span><span><b>{stats.currentStreak}</b>Current</span><span><b>{stats.bestStreak}</b>Best</span></div>
            <h3>Score distribution</h3>
            <div className="histogram">{distributionKeys.map((key) => { const count = stats.distribution[key] ?? 0; return <div className="histogram-row" key={key}><b>{key}</b><span style={{ width: `${Math.max(9, (count / maximumDistribution) * 100)}%` }}>{count}</span></div> })}</div>
          </section>
        </div>
      )}
    </main>
  )
}
