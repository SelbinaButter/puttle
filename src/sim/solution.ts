import { SPEED_COUNT } from './constants'

export interface MakeInput {
  aimIndex: number
  speedIndex: number
}

export function connectedComponents(makes: MakeInput[]): MakeInput[][] {
  const byKey = new Map(makes.map((putt) => [`${putt.aimIndex}:${putt.speedIndex}`, putt]))
  const unseen = new Set(byKey.keys())
  const components: MakeInput[][] = []
  while (unseen.size > 0) {
    const first = unseen.values().next().value as string
    const queue = [first]
    const component: MakeInput[] = []
    unseen.delete(first)
    while (queue.length > 0) {
      const key = queue.pop() as string
      const putt = byKey.get(key) as MakeInput
      component.push(putt)
      const neighbours = [
        `${putt.aimIndex - 1}:${putt.speedIndex}`,
        `${putt.aimIndex + 1}:${putt.speedIndex}`,
        `${putt.aimIndex}:${putt.speedIndex - 1}`,
        `${putt.aimIndex}:${putt.speedIndex + 1}`,
      ]
      for (const neighbour of neighbours) {
        if (unseen.delete(neighbour)) queue.push(neighbour)
      }
    }
    components.push(component)
  }
  return components.sort((a, b) => b.length - a.length)
}

export function widestMarginMake(makes: MakeInput[]): MakeInput | undefined {
  if (makes.length === 0) return undefined
  const makeKeys = new Set(makes.map((putt) => `${putt.aimIndex}:${putt.speedIndex}`))
  let best = makes[0]
  let bestMargin = -1
  for (const putt of makes) {
    let margin = 0
    for (let radius = 1; radius <= 6; radius += 1) {
      let enclosed = true
      for (let da = -radius; da <= radius && enclosed; da += 1) {
        const ds = radius - Math.abs(da)
        if (
          !makeKeys.has(`${putt.aimIndex + da}:${putt.speedIndex + ds}`) ||
          !makeKeys.has(`${putt.aimIndex + da}:${putt.speedIndex - ds}`)
        ) {
          enclosed = false
        }
      }
      if (!enclosed) break
      margin = radius
    }
    const centerBias = -Math.abs(putt.speedIndex - (SPEED_COUNT - 1) / 2) * 0.001
    if (margin + centerBias > bestMargin) {
      bestMargin = margin + centerBias
      best = putt
    }
  }
  return best
}
