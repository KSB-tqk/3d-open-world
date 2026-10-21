import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export default function Chat({ socket, messages, connected, open, active, onOpen, onClose, focusSignal = 0, mobile = false }) {
  const [draft, setDraft] = useState(''), list = useRef(), input = useRef(), nearBottom = useRef(true)
  useLayoutEffect(() => {
    if (!list.current) return
    const element = list.current
    if (nearBottom.current) element.scrollTop = element.scrollHeight
  }, [messages])
  useLayoutEffect(() => { if (open && active && focusSignal > 0) input.current?.focus() }, [open, active, focusSignal])
  const close = () => { input.current?.blur(); onClose?.() }
  const send = (event) => {
    event.preventDefault()
    const message = draft.trim()
    if (!message) { setDraft(''); close(); return }
    if (!connected) return
    socket.emit('chat:send', { message })
    setDraft('')
    close()
  }
  if (!open) return <button type="button" className={`chat-launcher${mobile ? ' mobile-chat-launcher' : ''}`} onClick={onOpen}>💬 Chat</button>
  return <section className={`chat${mobile ? ' chat-mobile' : ''}`} aria-label="World chat">
    <header className="chat-header"><strong>WORLD CHAT</strong>{active && <button type="button" className="chat-close" onClick={close} aria-label="Close chat">×</button>}</header>
    <div className="chat-messages" ref={list} onScroll={event => { const element = event.currentTarget; nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 72 }} aria-live="polite">{messages.map((item, i) => <p key={`${item.timestamp}-${i}`} className={item.system ? 'system-message' : ''}>{item.system ? item.message : <><b>{item.name}:</b> {item.message}</>}</p>)}</div>
    {active ? <form className="chat-bottom-shell" onSubmit={send}><input ref={input} value={draft} maxLength={200} onChange={e => setDraft(e.target.value)} placeholder={connected ? 'Type a message…' : 'Connect to chat'} aria-label="Chat message" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } else if (event.key === 'Enter') event.stopPropagation() }}/>{mobile && <button disabled={!connected || !draft.trim()}>Send</button>}</form> : <button type="button" className="chat-hint chat-bottom-shell" onClick={onOpen}>Type / to chat</button>}
  </section>
}
