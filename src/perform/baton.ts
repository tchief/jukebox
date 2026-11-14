/**
 * Phone as a conductor's baton (DeviceOrientation / DeviceMotion).
 *   raise / lower the phone (front-back tilt)  → loudness
 *   tilt left / right                           → spotlight west / east
 *   sharp downward strokes                      → the beat; their spacing sets the tempo
 * Raw sensor data jitters, so every signal is smoothed.
 */
import { Smoother, clamp } from '../core/math'
import type { Conductor } from './conductor'

export async function enableBaton(conductor: Conductor, onBeat?: () => void): Promise<() => void> {
  const DO = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
  const DM = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }
  if (DO.requestPermission) { if ((await DO.requestPermission()) !== 'granted') throw new Error('Motion sensors permission denied') }
  if (DM.requestPermission) { await DM.requestPermission().catch(() => 'denied') }

  const dyn = new Smoother(0.85), spot = new Smoother(0.85), tempo = new Smoother(0.6)
  let lastStroke = 0, armed = true
  let lastSend = 0

  const onOrient = (e: DeviceOrientationEvent) => {
    const now = performance.now()
    if (now - lastSend < 60) return
    lastSend = now
    const beta = e.beta ?? 45, gamma = e.gamma ?? 0
    // Phone held flat = soft, raised upright = loud.
    const d = dyn.next(clamp((beta - 10) / 70, 0, 1) * 1.4 + 0.1)
    const s = spot.next(clamp((gamma + 45) / 90, 0, 1))
    conductor.input({ dynamics: d, spotlight: Math.abs(gamma) < 6 ? null : s })
  }

  const onMotion = (e: DeviceMotionEvent) => {
    const a = e.acceleration?.y ?? e.accelerationIncludingGravity?.y ?? 0
    const now = performance.now()
    // A downward stroke: strong negative acceleration, re-armed once it settles.
    if (armed && a < -9) {
      armed = false
      if (lastStroke) {
        const interval = (now - lastStroke) / 1000
        if (interval > 0.25 && interval < 2) {
          const bpm = 60 / interval
          conductor.input({ tempo: clamp(tempo.next(bpm / 72), 0.5, 2) })
        }
      }
      lastStroke = now
      onBeat?.()
    } else if (a > -3) armed = true
  }

  addEventListener('deviceorientation', onOrient)
  addEventListener('devicemotion', onMotion)
  return () => { removeEventListener('deviceorientation', onOrient); removeEventListener('devicemotion', onMotion) }
}

export const batonSupported = () => typeof DeviceOrientationEvent !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
