export function utcDate(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function previousUtcDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - 1)
  return value.toISOString().slice(0, 10)
}
