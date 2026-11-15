# Earth Orchestra

**Hear NASA's Earth data. Conduct the planet.**

**Live:** https://earth-orchestra.pages.dev · [How it works](https://earth-orchestra.pages.dev/how) · [Embed example](https://earth-orchestra.pages.dev/embed-demo) · [Kiosk](https://earth-orchestra.pages.dev/?kiosk=1)

Earth Orchestra is an "Earth Jukebox" for the NASA Space Apps Challenge 2026 challenge
*The Earth Information Jukebox*. It turns NASA Earth Information Center (EIC) visualizations
into music in real time, so people who cannot see them (and everyone else) can hear our changing planet.

- **Jukebox:** pick a visualization, press Play. The data writes every note.
- **Autopilot + conductor:** nothing to touch by default; take over tempo, loudness, sections and a
  longitude "spotlight" with keys, mouse or touch.
- **Accessible:** full keyboard control, written descriptions, on-demand and periodic narration for
  screen readers, sound landmarks (reference tone, time ticks, stereo position).
- **Honest:** monotonic rules (more always sounds higher / more intense), colour bars decoded back to
  values, and a built-in reverse test that shows how much of the data is recoverable by ear.
- **Reusable:** one-line embed for any website, kiosk mode for museums and schools, WAV and MIDI export.

## How it works

```
EIC frames → Analyser → Features → Translation → Intents → Music system → Notes → Ensemble → Sound
                                                     ↑
                                    Conductor (autopilot or a person)
```

| Layer | What it does | Modules |
| --- | --- | --- |
| Analyser | Reduces each frame to 160×80 px, decodes colours to values via the colour bar, measures mean, spread, extremes, change, flashes and 32 west→east columns | `src/analysis` |
| Translation | Monotonic features → musical intents (contour, tension, density, dynamics, melody line) | `sequential@1`, `diverging@1`, `brightness@1` |
| Music system | Tuning + scale + harmony → notes as fractional MIDI (micro-tones allowed) | 12-TET, just; major, minor, dorian, pentatonic, whole-tone, raga Yaman- and pelog-inspired, continuous |
| Ensemble | Synthesised voices (no third-party samples) | orchestra, raw data, lullaby |
| Conductor | Tempo, dynamics, sections, spotlight on top of the autopilot | `src/perform` |

Variants are **recipes** (`src/core/recipes.ts`): the same recipe and frames always give the same score.

## Use it

- App: `/` · Kiosk: `/?kiosk=1` · Start with a visualization: `/?viz=3912`
- Browser extension (`extension/`, or [download zip](https://earth-orchestra.pages.dev/earth-orchestra-extension.zip)): adds an optional "Play as music" button to every NASA SVS page. Install: unzip → `chrome://extensions` → Developer mode → Load unpacked.
- Iframe player: `/frame.html?svs=3912&sound=orchestra`
- Embed on any page:

```html
<script type="module" src="https://YOUR-DEPLOYMENT/embed.js"></script>
<earth-orchestra svs="3912" sound="orchestra"></earth-orchestra>
```

## Develop

```bash
npm install
npm run dev      # local app (the NASA proxy needs Cloudflare; use the synthetic demo or open a file)
npm test         # unit tests: monotonicity, determinism, scales, SVS parsing, MIDI
npm run build    # → dist/
```

Deployment: Cloudflare Pages, build `npm run build`, output `dist`. `functions/svs/[[path]].ts` is a
read-only proxy to `svs.gsfc.nasa.gov` (API and media only) so the browser can read video pixels.

## Precompute pipeline (SVS number → features → soundtrack)

```bash
npx tsx scripts/precompute.ts 3912            # analyse an SVS visualization → public/features/3912.json + light video copy
node scripts/render-soundtracks.cjs <url> out 3912   # NASA video + Earth Orchestra audio → MP4 for the EIC
```

## Roadmap

- Shared room: phones join by QR code and conduct a big screen together (Cloudflare Durable Objects)
- Daily EIC visualizations sonified automatically (Cron Trigger + precompute)
- More musical languages (ragas, maqam, gamelan tunings), human preference testing, MusicXML scores

## Data and credits

- Visualizations: [NASA's Goddard Space Flight Center Scientific Visualization Studio](https://svs.gsfc.nasa.gov/gallery/earth-information-center/) (public domain), as listed in the challenge resources.
- [Tone.js](https://github.com/Tonejs/Tone.js) (MIT), [@tonejs/midi](https://github.com/Tonejs/Midi) (MIT).
- Earth Orchestra is not affiliated with or endorsed by NASA.

## License

Code: MIT. Generated audio: CC0.
