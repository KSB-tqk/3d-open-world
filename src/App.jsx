import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import World from './components/World.jsx'
import StartScreen from './ui/StartScreen.jsx'
import Chat from './ui/Chat.jsx'
import { socket } from './multiplayer/socket.js'
import { WORLD_MAP } from './world/worldConfig.js'
import { terrainHeight } from './components/terrain.js'
import MobileControls from './ui/MobileControls.jsx'

const isTouchCapable = () => typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)').matches)
const isTextEntry = target => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export default function App() {
  const [name, setName] = useState(''), [characterId, setCharacterId] = useState('casual_male'), [connected, setConnected] = useState(false), [connecting, setConnecting] = useState(false)
  const [players, setPlayers] = useState([]), [messages, setMessages] = useState([]), [worldReady, setWorldReady] = useState(false), [debugMap, setDebugMap] = useState(false)
  const [touchControls, setTouchControls] = useState(isTouchCapable), [forceMobileMode, setForceMobileMode] = useState(false), [chatOpen, setChatOpen] = useState(() => !isTouchCapable()), [chatActive, setChatActive] = useState(false), [chatFocusSignal, setChatFocusSignal] = useState(0)
  const mobileMode = touchControls || forceMobileMode
  const mobileInputRef = useRef({ x: 0, y: 0, sprint: false })
  useEffect(() => {
    const onConnect = () => { setConnected(true); setConnecting(false); socket.emit('player:join', { name, characterId }) }
    const onDisconnect = () => { setConnected(false); setConnecting(false); setPlayers([]) }
    const onConnectError = () => { setConnected(false); setConnecting(false) }
    const onExisting = list => setPlayers(list.map(player => ({ ...player, target: { current: { position: { ...player.position }, rotation: player.rotation, animation: player.animation } } })))
    const onJoin = player => setPlayers(current => [...current.filter(item => item.id !== player.id), { ...player, target: { current: { position: { ...player.position }, rotation: player.rotation, animation: player.animation } } }])
    const onMove = state => setPlayers(current => current.map(player => player.id === state.id ? { ...player, characterId: state.characterId || player.characterId, target: { current: { position: { ...state.position }, rotation: state.rotation, animation: state.animation } } } : player))
    const onLeft = id => setPlayers(current => current.filter(player => player.id !== id))
    const onChat = message => setMessages(current => [...current, message])
    const onSystem = message => setMessages(current => [...current, { ...message, system: true }])
    socket.on('connect', onConnect); socket.on('disconnect', onDisconnect); socket.on('connect_error', onConnectError)
    socket.on('players:existing', onExisting); socket.on('player:joined', onJoin); socket.on('player:moved', onMove); socket.on('player:left', onLeft)
    socket.on('chat:message', onChat); socket.on('system:message', onSystem)
    if (name) socket.connect()
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('connect_error', onConnectError); socket.off('players:existing', onExisting); socket.off('player:joined', onJoin); socket.off('player:moved', onMove); socket.off('player:left', onLeft); socket.off('chat:message', onChat); socket.off('system:message', onSystem) }
  }, [name, characterId])
  useEffect(() => {
    const onPointerDown = event => {
      if (event.pointerType === 'touch' && !touchControls) {
        setTouchControls(true)
        setChatOpen(false)
        setChatActive(false)
      }
    }
    const onResize = () => {
      if (isTouchCapable() && !touchControls) {
        setTouchControls(true)
        setChatOpen(false)
        setChatActive(false)
      }
    }
    addEventListener('pointerdown', onPointerDown, { passive: true })
    addEventListener('resize', onResize)
    return () => { removeEventListener('pointerdown', onPointerDown); removeEventListener('resize', onResize) }
  }, [touchControls])
  useEffect(() => {
    const onQuickChat = event => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || isTextEntry(event.target)) return
      event.preventDefault()
      setChatOpen(true)
      setChatActive(true)
      setChatFocusSignal(value => value + 1)
    }
    addEventListener('keydown', onQuickChat)
    return () => removeEventListener('keydown', onQuickChat)
  }, [])
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const toggle = event => { if (event.code === 'KeyM' && !['INPUT','TEXTAREA'].includes(event.target?.tagName)) setDebugMap(value => !value) }
    addEventListener('keydown', toggle)
    return () => removeEventListener('keydown', toggle)
  }, [])
  const enter = (playerName, selectedCharacterId) => { setCharacterId(selectedCharacterId); setName(playerName); setConnecting(true); setWorldReady(false) }
  const openChat = () => { mobileInputRef.current = { x: 0, y: 0, sprint: false }; setChatOpen(true); setChatActive(true); setChatFocusSignal(value => value + 1) }
  const closeChat = () => { setChatActive(false); if (mobileMode) setChatOpen(false); mobileInputRef.current = { x: 0, y: 0, sprint: false } }
  const onWorldReady = useCallback(() => setWorldReady(true), [])
  if (!name) return <main className="game"><StartScreen onPlay={enter}/></main>
  return <main className={`game${mobileMode ? ' mobile-preview' : ''}`}>
    <Canvas shadows camera={{ position: [WORLD_MAP.spawn.x, terrainHeight(WORLD_MAP.spawn.x,WORLD_MAP.spawn.z)+12, WORLD_MAP.spawn.z+22], fov: 55, near: 0.1, far: 1800 }} dpr={[1, 1.5]}>
      <color attach="background" args={['#8fd3ff']} /><fog attach="fog" args={['#a9dcf3', 240, 900]} />
      <Sky distance={450000} sunPosition={[80,120,40]} turbidity={7} rayleigh={1.2}/><ambientLight intensity={1.1}/>
      <hemisphereLight args={['#d8f1ff','#5d7d3e',1.4]}/><directionalLight castShadow position={[80,120,60]} intensity={2.4} shadow-mapSize={[2048,2048]} shadow-camera-left={-80} shadow-camera-right={80} shadow-camera-top={80} shadow-camera-bottom={-80}/>
      <World name={name} characterId={characterId} socket={socket} connected={connected} playerList={players} onReady={onWorldReady} debugMap={debugMap} mobileInputRef={mobileInputRef} mobileControls={mobileMode} chatOpen={chatOpen}/>
    </Canvas>
    {!worldReady && <div className="world-loading"><div className="loading-card"><div className="loading-spinner"/><span>Preparing {WORLD_MAP.displayName}</span><small>Loading the world…</small></div></div>}
    <section className="hud"><strong>{WORLD_MAP.displayName}</strong>{!mobileMode && <><span>WASD / Arrow Keys — move · Shift — sprint</span><span>Right mouse drag — orbit camera · / — chat</span></>}<span>{players.length + 1} players in world</span>{import.meta.env.DEV&&<span>M — {debugMap?'hide':'show'} map markers</span>}</section>
    <div className={`connection ${connected ? 'online' : ''}`}><i/>{connected ? 'Connected' : connecting ? 'Connecting…' : 'Disconnected'}</div>
    <Chat socket={socket} messages={messages} connected={connected} open={mobileMode ? chatOpen : true} active={chatActive} onOpen={openChat} onClose={closeChat} focusSignal={chatFocusSignal} mobile={mobileMode}/>
    {mobileMode && <MobileControls inputRef={mobileInputRef} onOpenChat={openChat} disabled={!worldReady || chatOpen}/>}
    {import.meta.env.DEV && <button className={`mobile-mode-toggle${mobileMode ? ' active' : ''}`} type="button" onClick={() => {
      setForceMobileMode(value => !value)
      setChatOpen(false)
      setChatActive(false)
      mobileInputRef.current = { x: 0, y: 0, sprint: false }
    }}>{forceMobileMode ? 'Exit mobile test' : 'Test mobile controls'}</button>}
  </main>
}
