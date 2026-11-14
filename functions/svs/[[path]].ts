/**
 * Cloudflare Pages Function: a read-only proxy to NASA's Scientific
 * Visualization Studio, so the browser can read video pixels (CORS) and the
 * jukebox can discover media through the public SVS JSON API.
 *
 *   /svs/api/3912          → https://svs.gsfc.nasa.gov/api/3912
 *   /svs/vis/a000000/...   → https://svs.gsfc.nasa.gov/vis/a000000/...
 *
 * Only GET/HEAD, only these two path prefixes, responses cached at the edge.
 * Files are passed through unchanged.
 */
const ORIGIN = 'https://svs.gsfc.nasa.gov/'
const ALLOWED = /^(api\/\d+\/?$|vis\/[\w\-./]+$)/

export const onRequest: PagesFunction = async ({ request, params }) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors() })
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })

  const path = (Array.isArray(params.path) ? params.path.join('/') : String(params.path ?? '')).replace(/\.\.+/g, '')
  if (!ALLOWED.test(path)) return new Response('Not allowed', { status: 403, headers: cors() })

  const upstream = new URL(path + new URL(request.url).search, ORIGIN)
  const headers = new Headers({ 'User-Agent': 'EarthOrchestra/1.0 (Space Apps 2026 sonification)' })
  const range = request.headers.get('Range')
  if (range) headers.set('Range', range)
  if (path.startsWith('api/')) headers.set('Accept', 'application/json')

  const res = await fetch(upstream.toString(), {
    method: request.method, headers, redirect: 'follow',
    cf: { cacheEverything: true, cacheTtl: path.startsWith('api/') ? 3600 : 86400 },
  } as RequestInit)

  const out = new Headers(res.headers)
  for (const [k, v] of Object.entries(cors())) out.set(k, v)
  out.set('Cache-Control', path.startsWith('api/') ? 'public, max-age=3600' : 'public, max-age=86400')
  return new Response(res.body, { status: res.status, headers: out })
}

function cors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  }
}
