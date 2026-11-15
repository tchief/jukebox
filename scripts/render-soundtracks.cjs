/**
 * Render the Earth Orchestra soundtrack for each visualization and mux it with
 * the visualization video: an MP4 the EIC can drop next to the original.
 *   node scripts/render-soundtracks.cjs <baseUrl> <outDir> [svs…] [--recipe=orchestra]
 * Uses the deployed app (or `vite preview`) in headless Chromium + ffmpeg.
 */
const { chromium } = require('playwright')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const [base = 'http://localhost:4173', outDir = 'soundtracks', ...rest] = process.argv.slice(2)
const recipe = (rest.find((a) => a.startsWith('--recipe=')) || '--recipe=orchestra').split('=')[1]
const ids = rest.filter((a) => /^\d+$/.test(a))
const ALL = ['3912', '5313', '5669', '5011', '5196', '4950', '4960', '5425', '5533']

;(async () => {
  fs.mkdirSync(outDir, { recursive: true })
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined
  const b = await chromium.launch({ proxy })
  const page = await b.newPage()
  for (const svs of ids.length ? ids : ALL) {
    await page.goto(`${base}/?viz=${svs}`)
    await page.waitForSelector('#loading[hidden]', { state: 'attached', timeout: 120000 })
    const res = await page.evaluate(async (recipe) => {
      const e = window.earthOrchestra
      if (e.recipe.id !== recipe) document.querySelector('#recipe').value = recipe, document.querySelector('#recipe').dispatchEvent(new Event('change'))
      const blob = await e.wav()
      const buf = new Uint8Array(await blob.arrayBuffer())
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      return { wav: btoa(s), media: e.source.element.currentSrc || e.source.element.src, title: e.entry.title, isVideo: e.source.isVideo, seconds: e.totalBeats * 60 / e.recipe.bpm }
    }, recipe)
    const wav = path.join(require('node:os').tmpdir(), `${svs}-${recipe}.wav`)
    fs.writeFileSync(wav, Buffer.from(res.wav, 'base64'))
    const mp4 = path.join(outDir, `${svs}-${recipe}.mp4`)
    const media = res.media
    const videoIn = res.isVideo ? ['-stream_loop', '-1', '-i', media] : ['-loop', '1', '-framerate', '30', '-i', media]
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...videoIn, '-i', wav, '-map', '0:v', '-map', '1:a', '-t', String(res.seconds),
      '-vf', 'scale=1024:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', mp4], { env: { ...process.env, ...(process.env.HTTPS_PROXY ? { http_proxy: process.env.HTTPS_PROXY } : {}) } })
    console.log(`${svs}: ${res.title} → ${mp4} (${res.seconds.toFixed(1)} s)`)
  }
  await b.close()
})().catch((e) => { console.error(e); process.exit(1) })
