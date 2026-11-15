// Extension page: hosts the Conduct the Earth player (pages on svs.gsfc.nasa.gov forbid third-party iframes).
const q = new URLSearchParams(location.search)
const f = document.createElement('iframe')
f.src = 'https://earth-orchestra.pages.dev/frame?svs=' + encodeURIComponent(q.get('svs') || 'demo-ocean')
f.title = 'Conduct the Earth player'
f.allow = 'autoplay'
document.body.appendChild(f)
