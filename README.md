# Daily putting puzzle

A daily blind-read putting puzzle. Watch an approach roll, pick an aim and pace before the contours are visible, and use every trace to read the green. Everyone gets the same green for their local calendar date.

Display name, share prefix, and tagline live in `src/game/brand.ts`; changing the brand does not change persistence keys or the generator seed.

## Run it

```bash
npm install
npm run dev
```

Starting the development server generates today’s local-date puzzle if it is missing. Run
`npm run generate` directly when you only want to refresh the puzzle archive.

Useful commands:

- `npm test` — fast simulation and share-card verification
- `npm run test:generation` — exhaustive 60-day generation verification
- `npm run test:all` — every unit and generation test
- `npm run test:browser` — Node/Chromium bitwise determinism harness (requires `npx playwright install chromium` once)
- `npm run generate -- --date 2026-08-20` — emit one public puzzle and a private metrics artifact
- `npm run generate -- --from 2026-08-20 --days 7` — generate a date range
- Add `--missing` to keep validated files that already exist; generation also refreshes `public/puzzles/index.json`
- `npm run build` — type-check and build the static app

Public puzzle definitions and the archive manifest live in `public/puzzles/`. Validation metrics and solutions go to the gitignored `.generated/solutions/`, so they are never included in the site build. The Pages workflow restores its validated archive cache and fills missing dates through tomorrow in UTC so every time zone has its puzzle by local midnight. The browser filters future dates out of daily, archive, and practice modes until the player's calendar reaches them.

## Structure

`src/sim/` is pure deterministic TypeScript shared by Node and the browser. `scripts/` samples and validates greens. `src/game/` owns daily persistence, streaks, and sharing. `src/ui/` contains the React canvas experience.
