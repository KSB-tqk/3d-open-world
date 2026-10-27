import MobileJoystick from './MobileJoystick.jsx'
import { useEffect, useRef } from 'react'
import { RIFLE_ENABLED } from '../weapons/registry.js'

export default function MobileControls({ inputRef, onOpenChat, onAttack, onFire, isAiming = false, onAimToggle, disabled = false, gameplayDisabled = false, attackDisabled = false }) {
  const sprintPointerId = useRef(null), sprintButton = useRef(null)
  const stopSprint = event => {
    if (event && sprintPointerId.current !== event.pointerId) return
    const activeId = sprintPointerId.current
    sprintPointerId.current = null
    inputRef.current.sprint = false
    if (activeId !== null && sprintButton.current?.hasPointerCapture?.(activeId)) {
      try { sprintButton.current.releasePointerCapture(activeId) } catch {}
    }
  }
  useEffect(() => { if (disabled || gameplayDisabled) stopSprint() }, [disabled, gameplayDisabled])
  useEffect(() => {
    const clear = () => stopSprint()
    const onVisibility = () => { if (document.visibilityState === 'hidden') clear() }
    addEventListener('blur', clear)
    document.addEventListener('visibilitychange', onVisibility)
    return () => { removeEventListener('blur', clear); document.removeEventListener('visibilitychange', onVisibility); clear() }
  }, [])
  return <div className={`mobile-controls${disabled ? ' controls-disabled' : ''}`} aria-label="Touch controls">
    <MobileJoystick disabled={disabled || gameplayDisabled} onMove={({ x, y }) => { inputRef.current.x = x; inputRef.current.y = y }} onEnd={() => { inputRef.current.x = 0; inputRef.current.y = 0 }}/>
    <div className="mobile-action-stack">
      {RIFLE_ENABLED && <button className={`mobile-aim${isAiming ? ' is-aiming' : ''}`} type="button" disabled={disabled || gameplayDisabled} aria-pressed={isAiming} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); onAimToggle?.() }}>{isAiming ? 'AIMING' : 'AIM'}</button>}
      <button className={`mobile-attack${isAiming ? ' is-aiming' : ''}`} type="button" disabled={disabled || gameplayDisabled || attackDisabled} aria-label={isAiming ? 'Fire rifle' : 'Melee attack'}
        onPointerDown={event => {
          event.preventDefault(); event.stopPropagation()
          if (disabled || gameplayDisabled || attackDisabled) return
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch {}
          if (isAiming) onFire?.()
          else onAttack?.()
        }}>{isAiming ? '✦' : '⚔'}<span>{isAiming ? 'FIRE' : 'ATTACK'}</span></button>
      <button ref={sprintButton} className="mobile-sprint" type="button" disabled={disabled || gameplayDisabled} aria-label="Hold to sprint"
        onPointerDown={event => {
          if (disabled || gameplayDisabled || sprintPointerId.current !== null) return
          event.preventDefault(); event.stopPropagation()
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch {}
          sprintPointerId.current = event.pointerId
          inputRef.current.sprint = true
        }} onPointerUp={event => { event.stopPropagation(); stopSprint(event) }}
        onPointerCancel={stopSprint} onLostPointerCapture={stopSprint}>SPRINT</button>
      <button className="mobile-chat-button" type="button" aria-label="Open chat" disabled={disabled} onPointerDown={event => event.stopPropagation()} onClick={onOpenChat}>💬</button>
    </div>
  </div>
}
