import { chromium } from '@playwright/test'

const mark = `
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="21.5" fill="#123d2e"/>
    <circle cx="24" cy="24" r="5.5" fill="#f4f0e6"/>
    <path d="M4 34.5C13.5 34.5 16 14 28 14c6.2 0 10.1 4.2 15.8 4.2" fill="none" stroke="#dff15d" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="4.8" cy="34.5" r="3.2" fill="#dff15d"/>
  </svg>`

const browser = await chromium.launch({ headless: true })

async function renderIcon(path: string, size: number, paper = false) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; background: ${paper ? '#eeeade' : 'transparent'}; }
      body { display: grid; place-items: center; }
      svg { width: 78%; height: 78%; filter: drop-shadow(${size * .018}px ${size * .025}px 0 rgba(23,34,28,.12)); }
    </style>${mark}`)
  await page.screenshot({ path, omitBackground: !paper })
  await page.close()
}

await renderIcon('public/favicon.png', 48)
await renderIcon('public/icon-192.png', 192, true)
await renderIcon('public/icon-512.png', 512, true)
await renderIcon('public/apple-touch-icon.png', 180, true)

const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await card.setContent(`
  <style>
    * { box-sizing: border-box; }
    html, body { width: 1200px; height: 630px; margin: 0; overflow: hidden; }
    body { position: relative; display: grid; grid-template-columns: 55% 45%; color: #17221c; background: #eeeade; font-family: "Helvetica Neue", Arial, sans-serif; }
    body::before { position: absolute; inset: 0; background: linear-gradient(rgba(23,34,28,.04) 1px, transparent 1px); background-size: 100% 64px; content: ''; }
    .copy { position: relative; z-index: 1; display: flex; padding: 52px 0 50px 62px; flex-direction: column; }
    .lockup { display: flex; align-items: center; gap: 14px; }
    .lockup svg { width: 60px; height: 60px; }
    .lockup b { font-size: 34px; font-weight: 900; letter-spacing: -.065em; }
    .issue { margin-left: 4px; padding-left: 16px; color: #647069; border-left: 1px solid rgba(23,34,28,.22); font-size: 11px; font-weight: 800; letter-spacing: .11em; line-height: 1.45; text-transform: uppercase; }
    .kicker { display: flex; margin-top: auto; align-items: center; gap: 10px; color: #66736b; font-size: 12px; font-weight: 850; letter-spacing: .17em; text-transform: uppercase; }
    .kicker i { width: 8px; height: 8px; border-radius: 50%; background: #78990c; box-shadow: 0 0 0 6px rgba(120,153,12,.1); }
    h1 { max-width: 600px; margin: 24px 0 34px; font-size: 82px; font-weight: 900; letter-spacing: -.075em; line-height: .86; }
    .rule { width: 92px; height: 6px; background: #dff15d; }
    .course { position: relative; z-index: 1; margin: 30px 30px 30px 0; overflow: hidden; border: 1px solid #17221c; background: #0c2c21; box-shadow: 11px 11px 0 rgba(23,34,28,.12); }
    .course::before { position: absolute; inset: 48px; border-radius: 22px; background: repeating-linear-gradient(to bottom, #568c64 0 56px, #5b9269 56px 112px); content: ''; }
    .meta { position: absolute; top: 0; right: 0; left: 0; display: flex; height: 48px; padding: 0 16px; align-items: center; justify-content: space-between; color: #dce4dd; border-bottom: 1px solid rgba(255,255,255,.15); font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    .meta span:first-child::before { display: inline-block; width: 7px; height: 7px; margin-right: 8px; border: 1px solid #dff15d; border-radius: 50%; content: ''; }
    .trace { position: absolute; top: 145px; left: 118px; width: 240px; height: 230px; border-top: 5px solid #f4f0e6; border-right: 5px solid #f4f0e6; border-radius: 0 100% 0 0; transform: rotate(26deg); opacity: .8; }
    .ball { position: absolute; top: 385px; left: 165px; width: 22px; height: 22px; border: 4px solid #4f855e; border-radius: 50%; background: #fffdf5; box-shadow: 0 3px 5px rgba(0,0,0,.24); }
    .cup { position: absolute; right: 110px; bottom: 118px; width: 28px; height: 28px; border: 5px solid #5a9168; border-radius: 50%; background: #071912; }
    .flag { position: absolute; right: 122px; bottom: 139px; width: 3px; height: 118px; background: #f4f0e6; }
    .flag::after { position: absolute; top: 0; left: 3px; width: 64px; height: 38px; background: #dff15d; content: ''; clip-path: polygon(0 0, 100% 0, 82% 100%, 0 100%); }
    .note { position: absolute; right: 48px; bottom: 48px; left: 48px; height: 42px; display: flex; padding: 0 13px; align-items: center; justify-content: space-between; color: #17221c; background: #dff15d; font-size: 9px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
  </style>
  <section class="copy">
    <div class="lockup">${mark}<b>Puttle</b><span class="issue">Daily green<br>No. 001</span></div>
    <div class="kicker"><i></i>The daily blind-read putting puzzle</div>
    <h1>Read it.<br>Roll it.<br>Hole it.</h1>
    <div class="rule"></div>
  </section>
  <section class="course">
    <div class="meta"><span>23'0" to cup</span><span>Stimp 10.2</span></div>
    <div class="trace"></div><div class="ball"></div><div class="cup"></div><div class="flag"></div>
    <div class="note"><span>Choose line</span><span>Choose pace</span></div>
  </section>`)
await card.screenshot({ path: 'public/share-card.png' })
await card.close()
await browser.close()
