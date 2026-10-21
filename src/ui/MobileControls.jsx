import MobileJoystick from './MobileJoystick.jsx'

export default function MobileControls({ inputRef, onOpenChat, disabled = false }) {
  const stopSprint = () => { inputRef.current.sprint = false }
  return <div className={`mobile-controls${disabled ? ' controls-disabled' : ''}`} aria-label="Touch controls">
    <MobileJoystick disabled={disabled} onMove={({ x, y }) => { inputRef.current.x = x; inputRef.current.y = y }} onEnd={() => { inputRef.current.x = 0; inputRef.current.y = 0 }}/>
    <div className="mobile-action-stack">
      <button className="mobile-sprint" type="button" disabled={disabled} aria-label="Hold to sprint"
        onPointerDown={event => {
          if (disabled) return
          event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
          inputRef.current.sprint = true
        }} onPointerUp={event => { event.stopPropagation(); stopSprint() }}
        onPointerCancel={stopSprint} onLostPointerCapture={stopSprint}>SPRINT</button>
      <button className="mobile-chat-button" type="button" aria-label="Open chat" disabled={disabled} onPointerDown={event => event.stopPropagation()} onClick={onOpenChat}>💬</button>
    </div>
  </div>
}
