import type { ShareMode } from './share'

const ARCHIVE_QUERY_PARAMETER = 'archive'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function archiveDateFromUrl(url: string, today: string): string | undefined {
  const date = new URL(url).searchParams.get(ARCHIVE_QUERY_PARAMETER)
  return date && DATE_PATTERN.test(date) && date < today ? date : undefined
}

export function gameUrl(
  basePath: string,
  currentUrl: string,
  mode: ShareMode,
  puzzleDate: string,
): string {
  const url = new URL(basePath, currentUrl)
  url.search = ''
  url.hash = ''
  if (mode === 'archive') url.searchParams.set(ARCHIVE_QUERY_PARAMETER, puzzleDate)
  return url.href.replace(/\/$/, '')
}

export function shareGameUrl(
  basePath: string,
  currentUrl: string,
  mode: ShareMode,
  puzzleDate: string,
): string {
  return gameUrl(
    basePath,
    currentUrl,
    mode === 'practice' ? 'archive' : mode,
    puzzleDate,
  )
}
