/**
 * <earth-orchestra> – add the sound of a NASA visualisation to any web page.
 *
 *   <script type="module" src="https://YOUR-DEPLOYMENT/embed.js"></script>
 *   <earth-orchestra svs="3912"></earth-orchestra>
 *
 * Attributes:
 *   svs       SVS visualisation id (or catalog id like "night-lights")
 *   sound     recipe id: orchestra | raw | lullaby | evening-raga | space
 *   autoplay  start when the visitor first interacts with the page
 *
 * The original visual stays untouched; the soundtrack is optional and starts
 * only when the visitor presses the button.
 */
import { EarthOrchestraEngine } from './engine'
import { CATALOG, type CatalogEntry } from './sources/catalog'
import { recipeById, RECIPES } from './core/recipes'

const BASE = new URL(/* @vite-ignore */ '.', import.meta.url).origin

const CSS = `
:host { display: block; font: 15px/1.4 system-ui, sans-serif; color: #e8edf7; }
.box { position: relative; background: #000; border-radius: 12px; overflow: hidden; aspect-ratio: 2/1; }
.vis, .vis > * { width: 100%; height: 100%; object-fit: contain; display: block; }
.bar { display: flex; gap: .5rem; align-items: center; padding: .5rem; background: #0e1526; border-radius: 0 0 12px 12px; flex-wrap: wrap; }
button, select { font: inherit; color: inherit; background: #141d33; border: 1px solid #233154; border-radius: 8px; padding: .4rem .7rem; cursor: pointer; }
.play { background: #ffd166; color: #111; border: 0; font-weight: 700; }
.msg { position: absolute; inset: 0; display: grid; place-content: center; background: rgba(7,11,22,.8); text-align: center; padding: 1rem; }
.credit { font-size: .8em; opacity: .75; margin-left: auto; }
.credit a { color: #6fb7ff; }
:focus-visible { outline: 3px solid #ffd166; outline-offset: 2px; }`

class EarthOrchestraElement extends HTMLElement {
  private engine = new EarthOrchestraEngine({ base: BASE, loop: true })
  private root = this.attachShadow({ mode: 'open' })

  async connectedCallback() {
    this.root.innerHTML = `<style>${CSS}</style>
      <div class="box"><div class="vis"></div><div class="msg" role="status">Loading…</div></div>
      <div class="bar" role="group" aria-label="Conduct the Earth sonification">
        <button class="play" type="button" disabled>Play sound</button>
        <select aria-label="Sound"></select>
        <button class="desc" type="button">Describe</button>
        <span class="credit">Sound: <a href="${BASE}/" target="_blank" rel="noopener">Conduct the Earth</a></span>
      </div>
      <div class="sr" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"></div>`
    const $ = <T extends Element>(s: string) => this.root.querySelector(s) as T
    const sel = $<HTMLSelectElement>('select')
    RECIPES.forEach((r) => sel.add(new Option(r.label, r.id)))
    const key = this.getAttribute('svs') ?? 'demo-ocean'
    const entry: CatalogEntry = CATALOG.find((c) => c.id === key || String(c.svs) === key)
      ?? { id: `svs-${key}`, svs: Number(key), title: `SVS ${key}`, translation: 'sequential@1', scale: 'colorbar', recipe: 'orchestra', description: 'A NASA Scientific Visualization Studio visualization.' }
    sel.value = this.getAttribute('sound') ?? entry.recipe
    this.engine.setRecipe(recipeById(sel.value))
    sel.addEventListener('change', () => this.engine.setRecipe(recipeById(sel.value)))
    const play = $<HTMLButtonElement>('.play'), msg = $<HTMLElement>('.msg')
    try {
      await this.engine.load(entry, (p) => (msg.textContent = `Listening to the frames… ${Math.round(p * 100)}%`))
      $('.vis').replaceChildren(this.engine.source!.element)
      msg.remove()
      play.disabled = false
    } catch (e) {
      msg.textContent = `Could not load: ${(e as Error).message}`
      return
    }
    play.addEventListener('click', async () => {
      if (this.engine.playing) { this.engine.pause(); play.textContent = 'Play sound' }
      else { await this.engine.play(); play.textContent = 'Pause sound' }
    })
    $('.desc').addEventListener('click', () => ($('.sr').textContent = this.engine.describe()))
    if (this.hasAttribute('autoplay')) {
      const go = () => { if (!this.engine.playing) play.click() }
      document.addEventListener('pointerdown', go, { once: true })
      document.addEventListener('keydown', go, { once: true })
    }
  }

  disconnectedCallback() { this.engine.stop() }
}

if (!customElements.get('earth-orchestra')) customElements.define('earth-orchestra', EarthOrchestraElement)
