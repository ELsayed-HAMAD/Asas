import { useEffect, useRef } from 'react'
import AuthShowcaseArt from './AuthShowcaseArt'

export default function AuthShowcase({ variant = 'security' }) {
  const stageRef = useRef(null)
  const theme = ['signin', 'signup', 'security'].includes(variant) ? variant : 'security'

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined
    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !window.matchMedia('(hover: hover) and (pointer: fine)').matches
    ) {
      return undefined
    }

    const scene = stage.querySelector('[data-auth-tilt]')
    const glare = stage.querySelector('[data-auth-glare]')
    if (!scene) return undefined

    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0
    let frame = 0

    const render = () => {
      currentX += (targetX - currentX) * 0.07
      currentY += (targetY - currentY) * 0.07

      scene.style.transform = `translate3d(${(currentX * 12).toFixed(2)}px, ${(currentY * 12).toFixed(2)}px, 0) rotateX(${(-currentY * 3.2).toFixed(3)}deg) rotateY(${(currentX * 4.4).toFixed(3)}deg)`

      if (Math.abs(targetX - currentX) > 0.0005 || Math.abs(targetY - currentY) > 0.0005) {
        frame = window.requestAnimationFrame(render)
      } else {
        frame = 0
      }
    }

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(render)
    }

    const handleMove = (event) => {
      if (event.pointerType !== 'mouse') return
      const rect = stage.getBoundingClientRect()
      const relativeX = (event.clientX - rect.left) / rect.width - 0.5
      const relativeY = (event.clientY - rect.top) / rect.height - 0.5
      targetX = relativeX * 2
      targetY = relativeY * 2

      if (glare) {
        glare.style.setProperty('--auth-mx', `${((relativeX + 0.5) * 100).toFixed(2)}%`)
        glare.style.setProperty('--auth-my', `${((relativeY + 0.5) * 100).toFixed(2)}%`)
        glare.style.opacity = '0.85'
      }
      schedule()
    }

    const handleLeave = () => {
      targetX = 0
      targetY = 0
      if (glare) glare.style.opacity = '0'
      schedule()
    }

    stage.addEventListener('pointermove', handleMove, { passive: true })
    stage.addEventListener('pointerleave', handleLeave)
    return () => {
      window.cancelAnimationFrame(frame)
      stage.removeEventListener('pointermove', handleMove)
      stage.removeEventListener('pointerleave', handleLeave)
      scene.style.transform = ''
      if (glare) glare.style.opacity = '0'
    }
  }, [])

  return (
    <aside
      data-testid="auth-showcase"
      data-variant={variant}
      data-modules="5"
      aria-hidden="true"
      className={`auth-showcase auth-showcase-${theme} relative hidden overflow-clip rounded-[32px] border border-info-border/10 lg:flex lg:max-h-[calc(100vh-2rem)]`}
    >
      <div className="auth-showcase-atmosphere pointer-events-none absolute inset-0" />
      <div className="auth-showcase-veil auth-showcase-veil-a pointer-events-none absolute" />
      <div className="auth-showcase-veil auth-showcase-veil-b pointer-events-none absolute" />

      <div ref={stageRef} className="auth-showcase-stage absolute inset-0 z-10">
        <div className="auth-showcase-enter absolute inset-0 flex items-center justify-center">
          <div data-auth-tilt className="auth-showcase-scene relative">
            <AuthShowcaseArt />
          </div>
        </div>

        <span data-auth-glare className="auth-showcase-glare pointer-events-none absolute inset-0" />
      </div>

      <div className="auth-showcase-vignette pointer-events-none absolute inset-0" />
      <div className="auth-showcase-grain pointer-events-none absolute inset-0" />
    </aside>
  )
}
