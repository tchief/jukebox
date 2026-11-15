import { EarthOrchestraEngine, type BeatInfo } from '../engine'
import { CATALOG, type CatalogEntry } from '../sources/catalog'
import { RECIPES, recipeById } from '../core/recipes'
import { SECTIONS, type SectionId } from '../core/types'
import { ensembles } from '../voices/ensembles'
import { download } from '../export/files'
import { HUE_FAMILY_NAMES } from '../analysis/colorscale'
import { batonSupported, enableBaton } from '../perform/baton'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const params = new URLSearchParams(location.search)
const kiosk = params.has('kiosk')
if (kiosk) document.body.classList.add('kiosk')

const engine = new EarthOrchestraEngine({ loop: true })
// Exposed for automation (soundtrack rendering, tests) and for curious developers.
;(window as unknown as { earthOrchestra: EarthOrchestraEngine }).earthOrchestra = engine
let current = 0
let lastBeat: BeatInfo | undefined
let beatStartedAt = 0
/** Kiosk: audio may start only after a first touch; then the jukebox runs by itself. */
let kioskStarted = false
let loops = 0
let failures = 0

// ───────────── Catalogue ─────────────
const list = $('catalog')
CATALOG.forEach((e, i) => {
  const li = document.createElement('li')
  const b = document.createElement('button')
  b.type = 'button'; b.textContent = e.title; b.dataset.i = String(i)
  b.addEventListener('click', () => select(i))
  li.appendChild(b); list.appendChild(li)
})

// ───────────── Recipes ─────────────
const recipeSel = $<HTMLSelectElement>('recipe')
RECIPES.forEach((r) => recipeSel.add(new Option(r.label, r.id)))
recipeSel.addEventListener('change', () => { engine.setRecipe(recipeById(recipeSel.value)); refreshSide() })

// ───────────── Sections ─────────────
const COLORS: Record<SectionId, string> = { strings: '#6fb7ff', bass: '#3f6fd8', melody: '#ffd166', brass: '#ff7a59', percussion: '#e5e5e5' }
const pads = new Map<SectionId, HTMLButtonElement>()
SECTIONS.forEach((s) => {
  const b = document.createElement('button')
  b.type = 'button'; b.className = 'pad'
  b.style.setProperty('--c', COLORS[s.id])
  b.setAttribute('aria-pressed', 'true')
  b.setAttribute('aria-keyshortcuts', s.key.toUpperCase())
  b.innerHTML = `<kbd>${s.key.toUpperCase()}</kbd><span>${s.label}</span>`
  // Tap = section on/off. Press and hold = solo: only this section plays until you let go.
  let holdTimer = 0, soloing = false
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault(); try { b.setPointerCapture(e.pointerId) } catch { /* not capturable */ }
    soloing = false
    holdTimer = window.setTimeout(() => { soloing = true; b.classList.add('solo'); engine.conductor.solo(s.id); navigator.vibrate?.(20) }, 300)
  })
  const release = () => {
    clearTimeout(holdTimer)
    if (soloing) { soloing = false; b.classList.remove('solo'); engine.conductor.solo(null) }
    else engine.conductor.toggleSection(s.id)
  }
  b.addEventListener('pointerup', release)
  b.addEventListener('pointercancel', () => { clearTimeout(holdTimer); if (soloing) { soloing = false; b.classList.remove('solo'); engine.conductor.solo(null) } })
  b.addEventListener('contextmenu', (e) => e.preventDefault())
  b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); engine.conductor.toggleSection(s.id) } })
  pads.set(s.id, b); $('sections').appendChild(b)
})

engine.conductor.listeners.push((st) => {
  pads.forEach((b, id) => b.setAttribute('aria-pressed', String(st.sections[id])))
  $<HTMLInputElement>('tempo').value = String(st.tempo); $('tempo-out').textContent = `${st.tempo.toFixed(2)}×`
  $<HTMLInputElement>('dyn').value = String(st.dynamics); $('dyn-out').textContent = `${Math.round(st.dynamics * 100)}%`
  $('mode').textContent = engine.conductor.active() ? 'You are conducting (autopilot returns after 45 s of rest)' : 'Autopilot: the data conducts'
})

// ───────────── Loading ─────────────
async function select(i: number) {
  current = (i + CATALOG.length) % CATALOG.length
  const e = CATALOG[current]
  list.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.i === String(current))))
  recipeSel.value = e.recipe
  engine.setRecipe(recipeById(e.recipe))
  await open(e)
}

async function open(e: CatalogEntry | File) {
  const loading = $('loading'), bar = $<HTMLProgressElement>('loading-bar')
  loading.hidden = false; bar.value = 0
  $('play').textContent = 'Play'
  try {
    await engine.load(e, (p) => (bar.value = p))
    const vis = $('visual'); vis.replaceChildren(engine.source!.element)
    $('viz-title').textContent = engine.source!.title
    $('viz-desc').textContent = engine.entry.description + (engine.entry.colors ? ' ' + engine.entry.colors : '')
    const credit = $('viz-credit')
    credit.replaceChildren()
    if (engine.source!.pageUrl) {
      const a = document.createElement('a'); a.href = engine.source!.pageUrl; a.textContent = engine.source!.credit; credit.append('Visualization: ', a)
    } else credit.textContent = engine.source!.credit
    refreshSide()
    $('now').textContent = engine.describe()
    loops = 0; failures = 0
    if (kiosk && kioskStarted) void engine.play().then(() => ($('play').textContent = 'Pause'))
  } catch (err) {
    $('loading-text').textContent = `Could not load: ${(err as Error).message}. Try the demo or open a file.`
    // Kiosk: skip what fails; if nothing from NASA loads, fall back to the offline demo.
    if (kiosk) setTimeout(() => void select(++failures >= CATALOG.length ? 0 : current + 1), 4000)
    return
  }
  loading.hidden = true
}

engine.onStatus.push((s) => ($('loading-text').textContent = s))

$<HTMLInputElement>('file').addEventListener('change', (ev) => {
  const f = (ev.target as HTMLInputElement).files?.[0]
  if (f) void open(f)
})

function refreshSide() {
  const legend = $('legend'); legend.replaceChildren()
  const hasFlashes = engine.samples.some((f) => f.flash > 0.01)
  engine.translation.legend
    .filter((l) => hasFlashes || !/flash/i.test(l))
    .forEach((l) => { const li = document.createElement('li'); li.textContent = l; legend.appendChild(li) })
  const fam = engine.samples.length ? engine.samples[0].layers : []
  const names = engine.layerNames ?? HUE_FAMILY_NAMES
  const used = fam.map((d, i) => (d > 0.05 ? names[i] : '')).filter(Boolean)
  if (engine.layerNames) { const li = document.createElement('li'); li.textContent = `Each type is its own sustained voice: ${engine.layerNames.join(', ')}.`; legend.appendChild(li) }
  else if (used.length > 1) { const li = document.createElement('li'); li.textContent = `Colour families heard as separate sustained voices: ${used.join(', ')}.`; legend.appendChild(li) }
  const li = document.createElement('li'); li.textContent = `Colour scale: ${engine.scale.label}.`; legend.appendChild(li)
  $('ensemble-desc').textContent = ensembles.get(engine.recipe.ensemble).description
  if (engine.samples.length) {
    const q = engine.evaluation()
    $('quality').innerHTML = `
      <dt>Data recoverable from melody</dt><dd>${(q.fidelity * 100).toFixed(0)}% <span class="muted">(correlation of note pitch with the value under the needle)</span></dd>
      <dt>Easy-to-follow steps</dt><dd>${(q.smoothness * 100).toFixed(0)}% <span class="muted">(melodic moves of a fifth or less)</span></dd>
      <dt>Flashes heard</dt><dd>${q.flashes ? `${q.flashHits} of ${q.flashes}` : 'none in this clip'}</dd>`
  }
}

// ───────────── Playback ─────────────
async function togglePlay() {
  if (engine.playing) { engine.pause(); $('play').textContent = 'Play' }
  else { await engine.play(); $('play').textContent = 'Pause' }
}
$('play').addEventListener('click', () => void togglePlay())

engine.onBeat.push((info) => {
  lastBeat = info; beatStartedAt = performance.now()
  // Kiosk: after two passes of a clip, move on to the next visualization.
  if (kiosk && info.beat === 0 && ++loops > 2 && !engine.conductor.active()) { void select(current + 1); return }
  if (info.beat % 4 === 0) {
    const text = engine.describe(info)
    $('now').textContent = text
    if ($<HTMLInputElement>('narrate').checked && info.bar % 4 === 0) $('live').textContent = text
  }
})

$('describe').addEventListener('click', () => { $('live').textContent = ''; requestAnimationFrame(() => ($('live').textContent = engine.describe(lastBeat))) })
$<HTMLInputElement>('tempo').addEventListener('input', (e) => engine.conductor.input({ tempo: Number((e.target as HTMLInputElement).value) }))
$<HTMLInputElement>('dyn').addEventListener('input', (e) => engine.conductor.input({ dynamics: Number((e.target as HTMLInputElement).value) }))

$('wav').addEventListener('click', async () => {
  const b = $('wav'); b.textContent = 'Rendering…'; b.setAttribute('aria-busy', 'true')
  try { download(await engine.wav(), `earth-orchestra-${engine.entry.id}-${engine.recipe.id}.wav`) }
  finally { b.textContent = 'Download WAV'; b.removeAttribute('aria-busy') }
})
$('midi').addEventListener('click', () => download(engine.midi(), `earth-orchestra-${engine.entry.id}-${engine.recipe.id}.mid`))

// ───────────── Spotlight & overlay ─────────────
const stage = $('stage'), overlay = $<HTMLCanvasElement>('overlay')
let spot: number | null = null
stage.addEventListener('pointermove', (e) => {
  const r = stage.getBoundingClientRect()
  spot = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
  engine.conductor.input({ spotlight: spot })
})
stage.addEventListener('pointerleave', () => { spot = null; engine.conductor.input({ spotlight: null }) })
// Finger (or mouse button) held on the map = fermata; sliding up/down moves the melody an octave.
let holdTimer = 0
stage.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  try { stage.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  holdTimer = window.setTimeout(() => { engine.hold(true); navigator.vibrate?.(60); $('live').textContent = 'Fermata: holding' }, 250)
})
stage.addEventListener('pointermove', (e) => {
  if (!e.buttons && e.pointerType === 'mouse') return
  const r = stage.getBoundingClientRect()
  const y = (e.clientY - r.top) / r.height
  engine.octave = y < 0.3 ? 1 : y > 0.7 ? -1 : 0
})
const releaseHold = () => { clearTimeout(holdTimer); if (engine.held) { engine.hold(false); $('live').textContent = 'Playing on' } engine.octave = 0 }
stage.addEventListener('pointerup', releaseHold)
stage.addEventListener('pointercancel', releaseHold)

function draw() {
  const r = stage.getBoundingClientRect()
  const dpr = devicePixelRatio || 1
  if (overlay.width !== Math.round(r.width * dpr)) { overlay.width = Math.round(r.width * dpr); overlay.height = Math.round(r.height * dpr) }
  const g = overlay.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, r.width, r.height)
  if (lastBeat && engine.playing) {
    const spb = 60000 / (engine.recipe.bpm * engine.conductor.state().tempo)
    const frac = Math.min(1, (performance.now() - beatStartedAt) / spb)
    const s = engine.conductor.state().spotlight
    if (s !== null) {
      g.fillStyle = 'rgba(255,209,102,0.18)'; g.fillRect(s * r.width - r.width / 32, 0, r.width / 16, r.height)
      g.strokeStyle = '#ffd166'; g.lineWidth = 2; g.beginPath(); g.moveTo(s * r.width, 0); g.lineTo(s * r.width, r.height); g.stroke()
    } else {
      const x = (((lastBeat.beat % 4) + frac) / 4) * r.width
      const grad = g.createLinearGradient(x - 40, 0, x, 0)
      grad.addColorStop(0, 'rgba(255,209,102,0)'); grad.addColorStop(1, 'rgba(255,209,102,0.35)')
      g.fillStyle = grad; g.fillRect(x - 40, 0, 40, r.height)
      g.strokeStyle = '#ffd166'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, r.height); g.stroke()
    }
    // Flash markers.
    lastBeat.features.flashColumns.forEach((v, i, a) => {
      if (v < 0.15) return
      g.fillStyle = `rgba(255,255,255,${Math.min(0.9, v)})`
      g.beginPath(); g.arc(((i + 0.5) / a.length) * r.width, r.height - 10, 4 + v * 6, 0, Math.PI * 2); g.fill()
    })
  }
  requestAnimationFrame(draw)
}
requestAnimationFrame(draw)

// ───────────── Keyboard ─────────────
const keyDownAt = new Map<string, number>()
document.addEventListener('keyup', (e) => {
  const sec = SECTIONS.find((s) => s.key === e.key.toLowerCase())
  if (!sec || !keyDownAt.has(sec.id)) return
  keyDownAt.delete(sec.id)
  if (engine.conductor.soloId === sec.id) { engine.conductor.solo(null); pads.get(sec.id)?.classList.remove('solo') }
  else engine.conductor.toggleSection(sec.id)
})
const help = $<HTMLDialogElement>('help')
$('help-btn').addEventListener('click', () => help.showModal())
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement
  if (t.closest('input[type=range], select, input[type=file], dialog') && e.key !== 'Escape') return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const k = e.key.toLowerCase()
  const sec = SECTIONS.find((s) => s.key === k)
  if (sec) {
    e.preventDefault()
    // Tap the key = on/off; hold it = solo until released.
    if (e.repeat) { if (engine.conductor.soloId !== sec.id) { engine.conductor.solo(sec.id); pads.get(sec.id)?.classList.add('solo') } return }
    keyDownAt.set(sec.id, performance.now())
    return
  }
  switch (e.key) {
    case ' ': if (t.tagName !== 'BUTTON') { e.preventDefault(); void togglePlay() } break
    case 'ArrowLeft': case 'ArrowRight': {
      e.preventDefault()
      spot = Math.max(0, Math.min(1, (spot ?? 0.5) + (e.key === 'ArrowLeft' ? -1 : 1) / 32))
      engine.conductor.input({ spotlight: spot })
      $('live').textContent = `Spotlight ${Math.round(spot * 360 - 180)}° longitude`
      break
    }
    case 'ArrowUp': e.preventDefault(); engine.conductor.nudge('dynamics', 0.1); break
    case 'ArrowDown': e.preventDefault(); engine.conductor.nudge('dynamics', -0.1); break
    case '+': case '=': engine.conductor.nudge('tempo', 0.1); break
    case '-': case '_': engine.conductor.nudge('tempo', -0.1); break
    case 'i': case 'I': $('describe').click(); break
    case 'n': case 'N': void select(current + 1); break
    case 'p': case 'P': void select(current - 1); break
    case '?': help.showModal(); break
    case 'Escape': spot = null; engine.conductor.reset(); $('live').textContent = 'Autopilot'; break
  }
})

// ───────────── Phone baton ─────────────
if (batonSupported()) {
  const b = document.createElement('button')
  b.type = 'button'; b.className = 'baton-btn'; b.textContent = '📱 Phone as baton'
  b.title = 'Raise the phone for louder, tilt left/right for the spotlight, beat downwards to set the tempo'
  // A big, obvious live panel: you see every move change the music.
  const hud = document.createElement('div')
  hud.className = 'baton-hud'; hud.hidden = true
  hud.innerHTML = `<p class="baton-help">Hold the phone as you are now = normal · raise it = <b>louder, drums and brass join</b> · lower it = softer, fewer instruments · tilt left/right = <b>spotlight</b> moves west/east · beat down = <b>tempo</b></p>
    <details class="baton-more"><summary>More gestures</summary><ul>
      <li><b>Turn it like a dial</b> (around the screen): timbre, from soft and dark to bright.</li>
      <li><b>Shake it sharply</b>: the whole orchestra hits together (tutti).</li>
      <li><b>Draw smooth circles</b>: long, connected notes (legato).</li>
      <li><b>Hold a finger on the map</b>: the music holds still (fermata); let go and it plays on.</li>
      <li><b>Slide the finger</b> left/right: spotlight west/east; up/down: melody an octave higher/lower.</li>
    </ul></details>
    <p class="baton-tutti" id="hud-tutti" aria-live="polite"></p>
    <div class="meter"><span>Loudness</span><i><b id="hud-dyn"></b></i><em id="hud-dyn-v"></em></div>
    <div class="meter"><span>Spotlight</span><i><b id="hud-spot" class="dot"></b></i><em id="hud-spot-v"></em></div>
    <p class="baton-sections" id="hud-sec"></p>
    <div class="meter"><span>Timbre</span><i><b id="hud-bright"></b></i><em id="hud-bright-v"></em></div>
    <div class="meter"><span>Tempo</span><i><b id="hud-tempo"></b></i><em id="hud-tempo-v"></em></div>`
  document.querySelector('.controls')!.after(hud)
  const showHud = () => {
    const st = engine.conductor.state()
    const dyn = Math.min(1, st.dynamics / 1.5)
    $('hud-dyn').style.width = `${Math.round(dyn * 100)}%`; $('hud-dyn-v').textContent = `${Math.round(st.dynamics * 100)}%`
    const sp = st.spotlight
    $('hud-spot').style.left = sp == null ? '50%' : `${Math.round(sp * 100)}%`
    $('hud-spot').style.opacity = sp == null ? '0.3' : '1'
    $('hud-spot-v').textContent = sp == null ? 'whole map' : sp < 0.4 ? 'west' : sp > 0.6 ? 'east' : 'centre'
    $('hud-sec').textContent = 'Playing: ' + SECTIONS.filter((x) => st.sections[x.id]).map((x) => x.label).join(' + ')
    $('hud-bright').style.width = `${Math.round(engine.brightness * 100)}%`; $('hud-bright-v').textContent = engine.brightness < 0.35 ? 'dark' : engine.brightness > 0.75 ? 'bright' : 'warm'
    $('hud-tempo').style.width = `${Math.round(Math.min(1, st.tempo / 2) * 100)}%`
    $('hud-tempo-v').textContent = `${Math.round(engine.recipe.bpm * st.tempo)} bpm`
  }
  engine.conductor.listeners.push(() => { if (!hud.hidden) showHud() })
  let stop: (() => void) | null = null
  b.addEventListener('click', async () => {
    if (stop) { stop(); stop = null; hud.hidden = true; engine.conductor.input({ sections: Object.fromEntries(SECTIONS.map((x) => [x.id, true])) }); b.textContent = '📱 Phone as baton'; b.setAttribute('aria-pressed', 'false'); return }
    // Start the sound inside the tap itself (phones only allow audio from a direct tap).
    if (!engine.playing) void togglePlay()
    try {
      stop = await enableBaton(engine.conductor, () => { navigator.vibrate?.(15); hud.classList.remove('beat'); void hud.offsetWidth; hud.classList.add('beat') }, {
        brightness: (x) => { engine.setBrightness(x); showHud() },
        tutti: () => { engine.tutti(); hud.classList.remove('beat'); void hud.offsetWidth; hud.classList.add('beat'); $('hud-tutti').textContent = 'TUTTI!'; setTimeout(() => ($('hud-tutti').textContent = ''), 600) },
        legato: (x) => { engine.legato = x },
      })
      b.textContent = '📱 Baton on (tap to stop)'; b.setAttribute('aria-pressed', 'true')
      hud.hidden = false; showHud()
    } catch (e) { $('live').textContent = (e as Error).message; hud.hidden = false; hud.querySelector('.baton-help')!.textContent = `Motion sensors are not available: ${(e as Error).message}` }
  })
  document.querySelector('.controls')!.appendChild(b)
}

// ───────────── Kiosk start screen ─────────────
if (kiosk) {
  const cover = document.createElement('button')
  cover.className = 'kiosk-start'; cover.type = 'button'
  cover.innerHTML = '<span class="logo" aria-hidden="true"></span><strong>Touch to hear the Earth</strong><span>NASA Earth data, played as music</span>'
  cover.addEventListener('click', async () => {
    kioskStarted = true; cover.remove()
    if (!engine.playing && engine.samples.length) await togglePlay()
  })
  document.body.appendChild(cover)
}

// ───────────── Start ─────────────
const start = params.get('viz')
const startIndex = Math.max(0, CATALOG.findIndex((c) => c.id === start || String(c.svs) === start), kiosk && !start ? 1 : 0)
void select(startIndex)

// ───────────── Version note ─────────────
// The Space Apps submission is frozen on the production URL; ongoing work deploys to
// branch previews (e.g. main.conduct-the-earth.pages.dev). Say which one this is.
{
  const sub = location.hostname.split('.')[0]
  if (location.hostname.endsWith('.pages.dev') && location.hostname.split('.').length > 3 && sub !== 'submission') {
    const note = document.createElement('p')
    note.className = 'version-note'
    note.innerHTML = 'In-development version, newer than our NASA Space Apps 2026 submission. Judges: the submitted version is at <a href="https://conduct-the-earth.pages.dev">conduct-the-earth.pages.dev</a>. Museums and galleries are welcome to try either.'
    document.body.prepend(note)
  }
}

// Phones may suspend the audio context mid-performance; any touch or returning to the tab wakes it.
document.addEventListener('pointerdown', () => engine.resumeAudio(), { capture: true })
document.addEventListener('visibilitychange', () => { if (!document.hidden) engine.resumeAudio() })
