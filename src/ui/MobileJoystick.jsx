import { useRef } from 'react'

const DEAD_ZONE = 0.08

export default function MobileJoystick({ onMove, onEnd, disabled = false }) {
  const base = useRef(null), knob = useRef(null), pointerId = useRef(null)
  const update = event => {
    const rect = base.current?.getBoundingClientRect()
    if (!rect) return
    const radius = rect.width * 0.37
    const dx = event.clientX - (rect.left + rect.width / 2)
    const dy = event.clientY - (rect.top + rect.height / 2)
    const length = Math.hypot(dx, dy), scale = length > radius ? radius / length : 1
    let x = dx * scale / radius, y = dy * scale / radius
    if (Math.hypot(x, y) < DEAD_ZONE) x = y = 0
    if (knob.current) knob.current.style.transform = `translate(${x * 29}px, ${y * 29}px)`
    onMove?.({ x, y })
  }
  const finish = event => {
    if (pointerId.current !== event.pointerId) return
    pointerId.current = null
    if (knob.current) knob.current.style.transform = 'translate(0, 0)'
    onEnd?.()
  }
  return <div ref={base} className={`mobile-joystick${disabled ? ' is-disabled' : ''}`} aria-label="Movement joystick"
    onPointerDown={event => {
      if (disabled || pointerId.current !== null) return
      event.preventDefault(); event.stopPropagation()
      pointerId.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      update(event)
    }}
    onPointerMove={event => { if (pointerId.current === event.pointerId) { event.preventDefault(); update(event) } }}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
    <span className="joystick-ring"/><span ref={knob} className="joystick-knob"/>
  </div>
}
