import { useEffect, useRef } from 'react'
import heroSrc from '../assets/hero-src.png'
import { HeroPlus } from '../icons'
import { toast } from './primitives'

/*
 * Figma applies a WebGPU "Dither" shader (Bayer 16×16, levels 3, pixelSize 2, colour mode) to the hero image,
 * then masks it with a horizontal alpha gradient. Browsers can't run Figma's shader runtime without the
 * experimental HTML-in-Canvas API, so this is a 1:1 CPU port of its ordered-dither pass + the mask stops.
 * A slow drift of the source makes the dots shimmer; it pauses off-screen and under reduced motion.
 */
const W = 842, H = 241, PX = 2, LEVELS = 3
const bayer = (() => {
  const m = (n: number): number[][] => {
    if (n === 1) return [[0]]
    const s = m(n / 2), h = n / 2
    return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => {
      const qx = Math.floor(x / h), qy = Math.floor(y / h)
      const q = qy === 0 && qx === 0 ? 0 : qy === 0 && qx === 1 ? 2 : qy === 1 && qx === 0 ? 3 : 1
      return s[y % h][x % h] * 4 + q
    }))
  }
  return m(16).flat().map((v) => (v + 0.5) / 256)
})()
// Mask stops from Figma (Rectangle 1000001920): 0→0, .6554→.70, .7740→.98, 1→1
const mask = (t: number) =>
  t < 0.6554 ? (t / 0.6554) * 0.7 : t < 0.774 ? 0.7 + ((t - 0.6554) / (0.774 - 0.6554)) * 0.28 : 0.98 + ((t - 0.774) / 0.226) * 0.02

export function Hero() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const cw = Math.ceil(W / PX), ch = Math.ceil(H / PX)
    canvas.width = cw; canvas.height = ch
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const src = document.createElement('canvas')
    src.width = cw + 24; src.height = ch
    const sctx = src.getContext('2d', { willReadFrequently: true })!
    const out = ctx.createImageData(cw, ch)
    const alpha = Array.from({ length: cw }, (_, x) => Math.round(mask((x + 0.5) / cw) * 255))
    const q = (c: number, t: number) => {
      const L = LEVELS - 1
      return Math.min(1, Math.max(0, Math.round((c + (t - 0.5) / L) * L) / L))
    }
    let data: Uint8ClampedArray | null = null
    const img = new Image()
    img.src = heroSrc
    const draw = (shift: number, lift: number) => {
      if (!data) return
      const d = out.data, sw = src.width, off = Math.round(shift)
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const si = (y * sw + x + off) * 4, o = (y * cw + x) * 4
          const t = bayer[(y & 15) * 16 + (x & 15)]
          d[o] = q(data[si] / 255 * lift, t) * 255
          d[o + 1] = q(data[si + 1] / 255 * lift, t) * 255
          d[o + 2] = q(data[si + 2] / 255 * lift, t) * 255
          d[o + 3] = alpha[x]
        }
      }
      ctx.putImageData(out, 0, 0)
    }
    let visible = true, rafId = 0, last = 0
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const loop = (now: number) => {
      rafId = requestAnimationFrame(loop)
      if (!visible || now - last < 66) return
      last = now
      const t = now / 1000
      draw(12 + Math.sin(t * 0.35) * 12, 1 + Math.sin(t * 0.5) * 0.04)
    }
    img.onload = () => {
      sctx.imageSmoothingQuality = 'high'
      sctx.drawImage(img, 0, 0, src.width, src.height)
      data = sctx.getImageData(0, 0, src.width, src.height).data
      draw(12, 1)
      if (!reduce) rafId = requestAnimationFrame(loop)
    }
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    io.observe(canvas)
    return () => { cancelAnimationFrame(rafId); io.disconnect() }
  }, [])

  return (
    <section className="hero" aria-labelledby="hero-title">
      <span className="hero__blob" style={{ left: 357.4, top: -77.1, width: 177, height: 101, background: '#A7F932', opacity: 0.6, filter: 'blur(120px)' }} />
      <span className="hero__blob" style={{ left: -10.6, top: -77.1, width: 177, height: 101, background: '#CDFC89', opacity: 0.6, filter: 'blur(120px)' }} />
      <span className="hero__blob" style={{ left: -10.6, top: -77.1, width: 177, height: 101, background: '#A7F932', opacity: 0.6, filter: 'blur(120px)' }} />
      <canvas ref={ref} className="hero__art" aria-hidden />
      <div className="hero__copy">
        <h1 id="hero-title" className="hero__title">One app, all trades.</h1>
        <p className="hero__desc">Deposit any token from Arbitrum, BNB Smart Chain, or Base - it arrives as-is, no gas and no seed phrases. Swap to USDC when you're ready to trade.</p>
      </div>
      <button className="btn-lime hero__cta" onClick={() => toast('Deposit flow — coming in the next prototype')}>
        <HeroPlus /> Deposit Funds
      </button>
      <span className="hero__blob" style={{ left: 944.4, top: -36.1, width: 317, height: 180, background: '#CDFC89', opacity: 0.7, filter: 'blur(50px)', mixBlendMode: 'soft-light' }} />
      {[0, 1, 2].map((i) => (
        <span key={i} className="hero__blob" style={{ left: 995, top: -35.5, width: 317, height: 180, background: '#B6FA55', opacity: 0.9, filter: 'blur(70px)', mixBlendMode: 'soft-light' }} />
      ))}
    </section>
  )
}
