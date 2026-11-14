import { EarthOrchestraEngine, type BeatInfo } from '../engine'
import { CATALOG, type CatalogEntry } from '../sources/catalog'
import { RECIPES, recipeById } from '../core/recipes'
import { SECTIONS, type SectionId } from '../core/types'
import { ensembles } from '../voices/ensembles'
import { download } from '../export/files'
import { HUE_FAMILY_NAMES } from '../analysis/colorscale'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const params = new URLSearchParams(location.search)
const kiosk = params.has('kiosk')
if (kiosk) document.body.classList.add('kiosk')

const engine = new EarthOrchestraEngine({ loop: true })
let current = 0
let lastBeat: BeatInfo | undefined
let beatStartedAt = 0

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
  b.addEventListener('click', () => engine.conductor.toggleSection(s.id))
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
    if (kiosk) void engine.play().then(() => ($('play').textContent = 'Pause'))
  } catch (err) {
    $('loading-text').textContent = `Could not load: ${(err as Error).message}. Try the demo or open a file.`
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
  engine.translation.legend.forEach((l) => { const li = document.createElement('li'); li.textContent = l; legend.appendChild(li) })
  const fam = engine.samples.length ? engine.samples[0].layers : []
  const used = fam.map((d, i) => (d > 0.05 ? HUE_FAMILY_NAMES[i] : '')).filter(Boolean)
  if (used.length > 1) { const li = document.createElement('li'); li.textContent = `Colour families heard as separate sustained voices: ${used.join(', ')}.`; legend.appendChild(li) }
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
const help = $<HTMLDialogElement>('help')
$('help-btn').addEventListener('click', () => help.showModal())
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement
  if (t.closest('input[type=range], select, input[type=file], dialog') && e.key !== 'Escape') return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const k = e.key.toLowerCase()
  const sec = SECTIONS.find((s) => s.key === k)
  if (sec) { engine.conductor.toggleSection(sec.id); e.preventDefault(); return }
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

// ───────────── Start ─────────────
const start = params.get('viz')
const startIndex = Math.max(0, CATALOG.findIndex((c) => c.id === start || String(c.svs) === start))
void select(startIndex)
