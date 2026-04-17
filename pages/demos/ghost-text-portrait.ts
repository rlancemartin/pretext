// Ghost Text Portrait: static blog text + moving Nodes-Think silhouette mask
// Text never moves. The silhouette drifts through revealing terracotta text.
//
// Rendering approach: direct luminance mapping from source image.
// Dark ink strokes → bright terracotta text (inverted — ink IS the art)
// White starburst nodes → bright ivory text
// Terracotta background → invisible
// This preserves every detail of the hand-drawn line art.

import nodesThinkUrl from '../../assets/brand/Nodes-Think-Clay.png'

const VW = 1400, VH = 900
const FONT_SIZE = 13
const CW = 7.8, CH = 16
const FONT_FAMILY = '"Courier New", Courier, monospace'
const FONT = `${FONT_SIZE}px ${FONT_FAMILY}`

const TITLE_LINES = ['Decoupling', 'the brain', 'from', 'the hands']
const TITLE_FONT = `700 64px "Styrene A", "Styrene B", -apple-system, "Helvetica Neue", Arial, sans-serif`
const TITLE_X = 210
const TITLE_LH = 70

// Variable-size foreground: quantised font cache to avoid ctx.font churn
const SIZE_MIN = 11, SIZE_MAX = 32
const fontFor: string[] = []
for (let s = SIZE_MIN; s <= SIZE_MAX; s++) fontFor[s] = `${s}px ${FONT_FAMILY}`

const BLOG = `A running topic on the Engineering Blog is how to build effective agents and design harnesses for long-running work. A common thread across this work is that harnesses encode assumptions about what Claude can not do on its own. However, those assumptions need to be frequently questioned because they can go stale as models improve. As just one example, in prior work we found that Claude Sonnet 4.5 would wrap up tasks prematurely as it sensed its context limit approaching. We addressed this by adding context resets to the harness. But when we used the same harness on Claude Opus 4.5, we found that the behavior was gone. The resets had become dead weight. We expect harnesses to continue evolving. So we built Managed Agents: a hosted service in the Claude Platform that runs long-horizon agents on your behalf through a small set of interfaces meant to outlast any particular implementation. Building Managed Agents meant solving an old problem in computing: how to design a system for programs as yet unthought of. Decades ago, operating systems solved this problem by virtualizing hardware into abstractions general enough for programs that did not exist yet. The abstractions outlasted the hardware. We drew inspiration from this pattern. The key insight is that the right abstraction boundary is not between the agent and its tools, but between the agent and the world. When you model the world as a set of capabilities rather than a set of APIs, you get interfaces that survive tool churn. The agent does not call functions; it exercises capabilities. This distinction matters because capabilities compose while function signatures do not. A capability to read a file, transform its contents, and write the result back is one thing. Three function calls are three things. The agent reasons about one thing. The harness routes the capability to whatever implementation exists today. Tomorrow the implementation changes. The capability persists. We have found that this framing resolves many of the tensions that arise when building long-running agents. The question of how much autonomy to grant becomes a question about which capabilities to expose. The question of how to handle errors becomes a question about which capabilities are idempotent. The question of how to observe agent behavior becomes a question about which capabilities emit traces. Everything reduces to the capability boundary. The system grows by adding capabilities, not by adding code paths. The agent stays simple. The world gets richer. This is the pattern we expect to see more of as agents mature. Not smarter agents with more tools, but simpler agents with better abstractions. The complexity moves from the agent to the platform, where it can be tested, versioned, and shared. The agent becomes a loop: observe, orient, decide, act. The platform becomes the world the agent acts in. And the interface between them becomes the thing that lasts. We are building that interface now.`

const cvs = document.getElementById('canvas') as HTMLCanvasElement
cvs.width = VW; cvs.height = VH
const ctx = cvs.getContext('2d')!

const MX = 50, MY = 36
const COLS = Math.floor((VW - MX * 2) / CW)
const ROWS = Math.floor((VH - MY * 2) / CH)

function buildGrid(): string[][] {
  const g: string[][] = []
  const words = BLOG.split(' ')
  let wi = 0
  for (let r = 0; r < ROWS; r++) {
    const row: string[] = []
    let c = 0
    while (c < COLS) {
      if (wi >= words.length) wi = 0
      const w = words[wi]!
      if (c === 0) {
        for (const ch of w) { if (c < COLS) { row.push(ch); c++ } }
        wi++; if (c < COLS) { row.push(' '); c++ }
      } else if (c + w.length <= COLS) {
        for (const ch of w) { row.push(ch); c++ }
        wi++; if (c < COLS) { row.push(' '); c++ }
      } else {
        while (c < COLS) { row.push(' '); c++ }
      }
    }
    g.push(row)
  }
  return g
}
const grid = buildGrid()

// Mask channels:
//   maskBright:  0..1  overall brightness for this pixel (ink=bright, bg=0)
//   maskIsWhite: 0..1  how white/node-like this pixel is (for ivory rendering)
let maskW = 0, maskH = 0
let maskBright: Float32Array = new Float32Array(0)
let maskIsWhite: Float32Array = new Float32Array(0)
const SIL_H = Math.round(VH * 0.88)
let SIL_W = 0

function loadMask(): Promise<void> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      // Sample full image first to find the figure's bounding box,
      // then crop to it so the drawn content (not the terracotta padding)
      // is what gets scaled to SIL_H.
      const SRC = 512
      const sc = document.createElement('canvas')
      sc.width = SRC; sc.height = SRC
      const scx = sc.getContext('2d', { willReadFrequently: true })!
      scx.drawImage(img, 0, 0, SRC, SRC)
      const sd = scx.getImageData(0, 0, SRC, SRC).data

      const BG_R = 217, BG_G = 119, BG_B = 87
      let x0 = SRC, x1 = 0, y0 = SRC, y1 = 0
      for (let y = 0; y < SRC; y++) for (let x = 0; x < SRC; x++) {
        const i = (y * SRC + x) * 4
        const r = sd[i]!, g = sd[i + 1]!, b = sd[i + 2]!, a = sd[i + 3]!
        if (a < 128) continue
        const dr = r - BG_R, dg = g - BG_G, db = b - BG_B
        if (dr * dr + dg * dg + db * db < 35 * 35) continue
        if (x < x0) x0 = x; if (x > x1) x1 = x
        if (y < y0) y0 = y; if (y > y1) y1 = y
      }
      const pad = 6
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad)
      x1 = Math.min(SRC - 1, x1 + pad); y1 = Math.min(SRC - 1, y1 + pad)
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1
      const asp = bw / bh
      SIL_W = Math.round(SIL_H * asp)

      // Resample the cropped region into the mask grid
      maskH = 512
      maskW = Math.max(1, Math.round(maskH * asp))
      const c = document.createElement('canvas')
      c.width = maskW; c.height = maskH
      const cx = c.getContext('2d', { willReadFrequently: true })!
      const srcScale = img.width / SRC
      cx.drawImage(
        img,
        x0 * srcScale, y0 * srcScale, bw * srcScale, bh * srcScale,
        0, 0, maskW, maskH,
      )
      const d = cx.getImageData(0, 0, maskW, maskH).data
      const n = maskW * maskH

      const rawBright = new Float32Array(n)
      const rawWhite = new Float32Array(n)

      for (let i = 0; i < n; i++) {
        const r = d[i * 4]!, g = d[i * 4 + 1]!, b = d[i * 4 + 2]!, a = d[i * 4 + 3]!
        if (a < 128) continue
        const dr = r - BG_R, dg = g - BG_G, db = b - BG_B
        const dist = Math.sqrt(dr * dr + dg * dg + db * db)
        if (dist < 35) continue  // terracotta background → invisible
        const lum = r * 0.299 + g * 0.587 + b * 0.114
        if (lum > 180) {
          rawBright[i] = 1.0
          rawWhite[i] = 1.0
        } else if (lum < 110) {
          rawBright[i] = 1.0 - lum / 260
        } else {
          rawBright[i] = Math.min(1, dist / 120)
        }
      }

      // Thicken strokes just enough to read as continuous text lines
      maskBright = gaussBlur(rawBright, maskW, maskH, 2.5)
      for (let i = 0; i < n; i++) {
        maskBright[i] = Math.min(1, maskBright[i]! * 1.6)
      }
      maskIsWhite = gaussBlur(rawWhite, maskW, maskH, 2.5)

      // Centroid of the white starburst → auto-ripple origin
      let sx = 0, sy = 0, sw = 0
      for (let y = 0; y < maskH; y++) for (let x = 0; x < maskW; x++) {
        const v = rawWhite[y * maskW + x]!
        if (v > 0.3) { sx += x * v; sy += y * v; sw += v }
      }
      nodeHub.u = sw > 0 ? sx / sw / maskW : 0.5
      nodeHub.v = sw > 0 ? sy / sw / maskH : 0.35

      console.log(`Mask ${maskW}x${maskH} cropped from bbox ${bw}x${bh}`)
      resolve()
    }
    img.onerror = () => { console.error('Image load failed'); resolve() }
    img.src = nodesThinkUrl
  })
}

function gaussBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.ceil(sigma * 2.5)
  const k: number[] = []; let ks = 0
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); ks += v }
  for (let i = 0; i < k.length; i++) k[i]! /= ks
  const tmp = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let j = -r; j <= r; j++) s += src[y * w + Math.min(w - 1, Math.max(0, x + j))]! * k[j + r]!; tmp[y * w + x] = s
  }
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let j = -r; j <= r; j++) s += tmp[Math.min(h - 1, Math.max(0, y + j)) * w + x]! * k[j + r]!; out[y * w + x] = s
  }
  return out
}

// Static dim text layer
function makeDimLayer(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = VW; c.height = VH
  const cx = c.getContext('2d')!
  cx.fillStyle = '#121210'; cx.fillRect(0, 0, VW, VH)
  cx.font = FONT; cx.textBaseline = 'top'
  cx.fillStyle = 'rgba(38,38,34,0.25)'
  for (let r = 0; r < ROWS; r++) {
    let s = ''; for (let c2 = 0; c2 < COLS; c2++) s += grid[r]![c2]!
    cx.fillText(s, MX, MY + r * CH)
  }
  return c
}

let dimLayer: HTMLCanvasElement

function sampleMask(vx: number, vy: number, scx: number, scy: number): [number, number] {
  const lx = vx - scx + SIL_W / 2
  const ly = vy - scy + SIL_H / 2
  if (lx < 0 || lx >= SIL_W || ly < 0 || ly >= SIL_H) return [0, 0]
  const mx = Math.floor((lx / SIL_W) * maskW)
  const my = Math.floor((ly / SIL_H) * maskH)
  const i = my * maskW + mx
  return [maskBright[i]!, maskIsWhite[i]!]
}

// --- Water ripple system ---------------------------------------------------
// Each ripple is a packet of N_ECHO concentric rings. A ring contributes a
// signed surface height h at each cell: positive on the leading crest,
// slightly negative in the trough behind it. Characters displace radially
// by h·DISP_GAIN and brighten by |h| toward ivory.
interface Ripple { x: number; y: number; startTime: number; amp: number }
const ripples: Ripple[] = []
const nodeHub = { u: 0.5, v: 0.35 }

const RIPPLE_SPEED = 380
const RIPPLE_DURATION = 2.6
const N_ECHO = 3
const ECHO_DELAY = 0.22
const ECHO_AMPS = [1.0, 0.45, 0.22]
const DISP_GAIN = 11

declare global {
  interface Window {
    __ghostPulse: number
    __ghostTime: number | null
    __ghostReady: boolean
    __ghostAddRipple: (x: number, y: number) => void
  }
}
window.__ghostPulse = 0
window.__ghostTime = null
window.__ghostReady = false
let lastRawP = 0

function pruneRipples(t: number): void {
  for (let i = ripples.length - 1; i >= 0; i--) {
    if (t - ripples[i]!.startTime > RIPPLE_DURATION + N_ECHO * ECHO_DELAY) {
      ripples.splice(i, 1)
    }
  }
}

/** Returns [glow 0..1, dx, dy] — glow is unsigned crest intensity for colour;
 *  (dx,dy) is the summed radial displacement in px. */
function computeRipple(px: number, py: number, t: number): [number, number, number] {
  let glow = 0, dx = 0, dy = 0
  for (const rip of ripples) {
    const ex = px - rip.x, ey = py - rip.y
    const dist = Math.sqrt(ex * ex + ey * ey)
    const ux = dist > 0.001 ? ex / dist : 0
    const uy = dist > 0.001 ? ey / dist : 0
    for (let k = 0; k < N_ECHO; k++) {
      const el = t - rip.startTime - k * ECHO_DELAY
      if (el < 0 || el > RIPPLE_DURATION) continue
      const age = el / RIPPLE_DURATION
      const radius = el * RIPPLE_SPEED
      const width = 55 + age * 120              // ring spreads as it travels
      const d = (dist - radius) / width          // signed, −1..+1 across ring
      if (d < -1.4 || d > 1.0) continue
      // One full sine cycle across the ring: crest at d≈−0.25, trough at d≈+0.4
      const h = Math.sin((d + 0.25) * Math.PI) * (1 - d * 0.3)
      const fall = (1 - age) * (1 - age)
      const a = rip.amp * ECHO_AMPS[k]! * fall
      glow += Math.max(0, h) * a
      dx += ux * h * a * DISP_GAIN
      dy += uy * h * a * DISP_GAIN
    }
  }
  return [Math.min(1, glow), dx, dy]
}

async function init(): Promise<void> {
  dimLayer = makeDimLayer()
  await loadMask()

  cvs.addEventListener('click', (e: MouseEvent) => {
    const rect = cvs.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (VW / rect.width)
    const y = (e.clientY - rect.top) * (VH / rect.height)
    const t = window.__ghostTime !== null ? window.__ghostTime * 0.001 : performance.now() * 0.001
    ripples.push({ x, y, startTime: t, amp: 1.0 })
  })

  window.__ghostAddRipple = (x: number, y: number) => {
    const t = window.__ghostTime !== null ? window.__ghostTime * 0.001 : performance.now() * 0.001
    ripples.push({ x, y, startTime: t, amp: 1.0 })
  }

  window.__ghostReady = true
  requestAnimationFrame(render)
}

function render(now: number): void {
  const effectiveTime = window.__ghostTime !== null ? window.__ghostTime : now

  ctx.drawImage(dimLayer, 0, 0)
  if (maskW === 0) { requestAnimationFrame(render); return }

  const t = effectiveTime * 0.001
  pruneRipples(t)

  // Brain node pulse — and emit a soft auto-ripple from the starburst hub
  // on each rising edge so the page breathes without interaction.
  const rawP = Math.sin(t * 2.5)
  const pulse = rawP > 0 ? Math.sqrt(rawP) : 0
  if (lastRawP <= 0 && rawP > 0) {
    const hx = VW * 0.62 - SIL_W / 2 + nodeHub.u * SIL_W
    const hy = VH / 2 - SIL_H / 2 + nodeHub.v * SIL_H
    ripples.push({ x: hx, y: hy, startTime: t, amp: 0.35 })
  }
  lastRawP = rawP
  window.__ghostPulse = pulse

  const silCX = VW * 0.62
  const silCY = VH / 2

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let curSize = -1

  for (let r = 0; r < ROWS; r++) {
    const cy = MY + r * CH + CH / 2
    for (let c = 0; c < COLS; c++) {
      const ch = grid[r]![c]!
      if (ch === ' ') continue
      const cx2 = MX + c * CW + CW / 2
      const [bright, white] = sampleMask(cx2, cy, silCX, silCY)
      const [rv, rdx, rdy] = computeRipple(cx2, cy, t)

      if (bright < 0.03 && rv <= 0.01) continue

      // Variable glyph size: swell on ink strokes & nodes, lift on ripple crest
      const wLevel = white > 0.12 ? Math.min(1, white * 2) : 0
      const sz = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(
        FONT_SIZE * (0.85 + bright * 1.1 + wLevel * 0.5 + rv * 0.9)
      )))
      if (sz !== curSize) { ctx.font = fontFor[sz]!; curSize = sz }

      const px = cx2 + rdx
      const py = cy + rdy

      let cr: number, cg: number, cb: number, alpha: number
      if (wLevel > 0) {
        const glow = Math.min(1, wLevel * 0.55 + pulse * 0.45)
        ctx.fillStyle = `rgba(255,255,250,${(glow * 0.28).toFixed(3)})`
        ctx.fillRect(px - sz * 0.35, py - sz * 0.45, sz * 0.7, sz * 0.9)
        cr = 185 + 70 * glow; cg = 175 + 80 * glow; cb = 165 + 85 * glow
        alpha = 1.0
      } else if (bright >= 0.03) {
        cr = 224; cg = 134; cb = 100
        alpha = Math.min(1, bright * 1.4)
      } else {
        cr = 120; cg = 122; cb = 118
        alpha = 0
      }

      if (rv > 0.01) {
        cr = cr + (250 - cr) * rv
        cg = cg + (250 - cg) * rv
        cb = cb + (247 - cb) * rv
        alpha = Math.min(1, alpha + rv * 0.85)
      }

      ctx.fillStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${alpha.toFixed(3)})`
      ctx.fillText(ch, px, py)
    }
  }

  // Title — ripple nudges each line as it passes
  ctx.font = TITLE_FONT
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const titleTop = VH / 2 - (TITLE_LINES.length - 1) * TITLE_LH / 2
  for (let i = 0; i < TITLE_LINES.length; i++) {
    const ly = titleTop + i * TITLE_LH
    const [trv, tdx, tdy] = computeRipple(TITLE_X + 140, ly - 20, t)
    const tr = 250, tg = 250, tb = 247
    ctx.fillStyle = `rgba(${tr},${tg},${tb},${(0.92 + trv * 0.08).toFixed(3)})`
    ctx.fillText(TITLE_LINES[i]!, TITLE_X + tdx * 0.6, ly + tdy * 0.6)
  }

  requestAnimationFrame(render)
}

init()
