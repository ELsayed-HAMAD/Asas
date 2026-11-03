import { useEffect, useRef } from 'react'
import './LandingFX.css'

/**
 * Additive pointer choreography for the marketing landing page only.
 *
 * Everything here is progressive decoration: the page is fully usable without it, and
 * `prefers-reduced-motion` removes all of it. Nothing outside the landing route imports this.
 */
export default function LandingFX() {
  const glowRef = useRef(null)
  const progressRef = useRef(null)

  useEffect(() => {
    const glow = glowRef.current
    const progress = progressRef.current
    if (!glow || !progress) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const pointer = { x: window.innerWidth / 2, y: window.innerHeight * 0.35 }
    const current = { ...pointer }
    let frame = 0
    let visible = false

    const render = () => {
      current.x += (pointer.x - current.x) * 0.14
      current.y += (pointer.y - current.y) * 0.14
      glow.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`
      const settled = Math.abs(pointer.x - current.x) < 0.4 && Math.abs(pointer.y - current.y) < 0.4
      frame = settled ? 0 : window.requestAnimationFrame(render)
    }

    const queue = () => {
      if (!frame) frame = window.requestAnimationFrame(render)
    }

    const onPointerMove = event => {
      pointer.x = event.clientX
      pointer.y = event.clientY
      if (!visible) {
        visible = true
        glow.dataset.active = 'true'
      }
      queue()
    }

    const onPointerLeave = () => {
      visible = false
      glow.dataset.active = 'false'
    }

    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      const ratio = scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0
      progress.style.transform = `scaleX(${ratio})`
    }

    // Magnetic pull on the hero calls to action. Bounded to 6px so it reads as intent, not drift.
    const targets = Array.from(document.querySelectorAll('[data-hero-actions] a, [data-hero-actions] button'))
    const cleanups = targets.map(target => {
      target.classList.add('landing-fx-magnetic')
      const onMove = event => {
        const box = target.getBoundingClientRect()
        const dx = (event.clientX - (box.left + box.width / 2)) / (box.width / 2)
        const dy = (event.clientY - (box.top + box.height / 2)) / (box.height / 2)
        target.style.transform = `translate3d(${dx * 6}px, ${dy * 4}px, 0)`
      }
      const onLeave = () => {
        target.style.transform = ''
      }
      target.addEventListener('pointermove', onMove)
      target.addEventListener('pointerleave', onLeave)
      return () => {
        target.removeEventListener('pointermove', onMove)
        target.removeEventListener('pointerleave', onLeave)
        target.style.transform = ''
        target.classList.remove('landing-fx-magnetic')
      }
    })

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('pointerleave', onPointerLeave)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('scroll', onScroll)
      cleanups.forEach(cleanup => cleanup())
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <>
      <div ref={glowRef} className="landing-fx-glow" aria-hidden="true" />
      <div ref={progressRef} className="landing-fx-progress" aria-hidden="true" />
    </>
  )
}
