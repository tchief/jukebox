// Earth Orchestra: adds an optional "Play as music" panel to NASA SVS visualization pages.
// The NASA page is never changed; the player runs in an iframe from earth-orchestra.pages.dev.
(() => {
  const APP = 'https://earth-orchestra.pages.dev'
  const m = location.pathname.match(/^\/(\d{3,6})\/?$/)
  if (!m || document.getElementById('earth-orchestra-ext')) return
  const svs = m[1]

  const box = document.createElement('aside')
  box.id = 'earth-orchestra-ext'
  box.setAttribute('aria-label', 'Earth Orchestra: hear this visualization as music')
  box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;font:15px/1.4 system-ui,sans-serif;'

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = '♫ Play as music'
  btn.setAttribute('aria-expanded', 'false')
  btn.style.cssText = 'background:#ffd166;color:#111;border:0;border-radius:999px;padding:12px 18px;font:700 15px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,.35)'

  let panel = null
  btn.addEventListener('click', () => {
    if (panel) { panel.remove(); panel = null; btn.textContent = '♫ Play as music'; btn.setAttribute('aria-expanded', 'false'); return }
    panel = document.createElement('div')
    panel.style.cssText = 'width:min(560px,calc(100vw - 32px));margin-bottom:10px;border-radius:14px;overflow:hidden;background:#070b16;box-shadow:0 10px 40px rgba(0,0,0,.45)'
    const head = document.createElement('div')
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;color:#e8edf7;background:#0e1526'
    head.innerHTML = '<strong style="color:#ffd166">Earth Orchestra</strong><a style="color:#6fb7ff" target="_blank" rel="noopener">Open full jukebox ↗</a>'
    head.querySelector('a').href = `${APP}/?viz=${svs}`
    const frame = document.createElement('iframe')
    frame.src = chrome.runtime.getURL(`player.html?svs=${svs}`)
    frame.title = 'Earth Orchestra player'
    frame.allow = 'autoplay'
    frame.style.cssText = 'display:block;width:100%;height:360px;border:0'
    panel.append(head, frame)
    box.insertBefore(panel, btn)
    btn.textContent = 'Close music'
    btn.setAttribute('aria-expanded', 'true')
  })
  box.appendChild(btn)
  document.body.appendChild(box)
})()
