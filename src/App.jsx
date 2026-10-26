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
import { CAMERA_CONFIG, COMBAT_CONFIG } from './combat/combatConfig.js'

const isTouchCapable = () => typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)').matches)
const isTextEntry = target => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export default function App() {
  const [name, setName] = useState(''), [characterId, setCharacterId] = useState('casual_male'), [connected, setConnected] = useState(false), [connecting, setConnecting] = useState(false)
  const [players, setPlayers] = useState([]), [messages, setMessages] = useState([]), [worldReady, setWorldReady] = useState(false), [debugMap, setDebugMap] = useState(false)
  const [localAlive, setLocalAlive] = useState(true), [localRespawnPosition, setLocalRespawnPosition] = useState(null)
  const [attackPending, setAttackPending] = useState(false), [localAttack, setLocalAttack] = useState(null)
  const [combatDebug, setCombatDebug] = useState(() => import.meta.env.DEV && COMBAT_CONFIG.showDebug)
  const [localHp, setLocalHp] = useState(COMBAT_CONFIG.maxHp), [localDamageFeedback, setLocalDamageFeedback] = useState(null)
  const [touchControls, setTouchControls] = useState(isTouchCapable), [forceMobileMode, setForceMobileMode] = useState(false), [chatOpen, setChatOpen] = useState(() => !isTouchCapable()), [chatActive, setChatActive] = useState(false), [chatFocusSignal, setChatFocusSignal] = useState(0)
  const mobileMode = touchControls || forceMobileMode
  const mobileInputRef = useRef({ x: 0, y: 0, sprint: false })
  const localAttackRef = useRef({ until: 0 }), localPlayerStateRef = useRef(null), attackIntentRef = useRef({ pending: false }), feedbackSequence = useRef(0)
  const clearAttackCameraState = useCallback((clearActiveAttack = false) => {
    attackIntentRef.current.pending = false
    setAttackPending(false)
    if (clearActiveAttack) {
      localAttackRef.current = { until: 0 }
      setLocalAttack(null)
    }
  }, [])
  const combatMode = attackPending || Boolean(localAttack)
  const finishLocalAttack = useCallback(attackId => {
    if (localAttackRef.current.attackId !== attackId) return
    localAttackRef.current = { until: 0 }
    setLocalAttack(current => current?.attackId === attackId ? null : current)
  }, [])
  useEffect(() => {
    const onConnect = () => { setConnected(true); setConnecting(false); setLocalHp(COMBAT_CONFIG.maxHp); setLocalAlive(true); setLocalRespawnPosition(null); clearAttackCameraState(true); socket.emit('player:join', { name, characterId }) }
    const onDisconnect = () => { setConnected(false); setConnecting(false); setPlayers([]); setLocalAlive(true); setLocalDamageFeedback(null); clearAttackCameraState(true) }
    const onConnectError = () => { setConnected(false); setConnecting(false) }
    const onExisting = list => setPlayers(list.map(player => ({ ...player, hp: player.hp ?? COMBAT_CONFIG.maxHp, alive: player.alive !== false, target: { current: { position: { ...player.position }, rotation: player.rotation, animation: player.animation } } })))
    const onJoin = player => setPlayers(current => [...current.filter(item => item.id !== player.id), { ...player, hp: player.hp ?? COMBAT_CONFIG.maxHp, alive: player.alive !== false, target: { current: { position: { ...player.position }, rotation: player.rotation, animation: player.animation } } }])
    const onMove = state => setPlayers(current => current.map(player => {
      if (player.id !== state.id || player.alive === false) return player
      return {
        ...player,
        characterId: state.characterId || player.characterId,
        hp: state.hp ?? player.hp,
        attack: player.attack ? { ...player.attack, rotation: state.rotation } : player.attack,
        target: { current: { ...player.target.current, position: { ...state.position }, rotation: state.rotation, animation: state.animation } },
      }
    }))
    const onAttackStarted = event => {
      const startedAt = performance.now()
      const attack = { attackId: event.attackId, startedAt, durationMs: event.durationMs, windupMs: event.windupMs, activeMs: event.activeMs, rotation: event.rotation, until: startedAt + event.durationMs }
      if (event.attackerId === socket.id) {
        localAttackRef.current = attack
        setLocalAttack(attack)
        setAttackPending(false)
        attackIntentRef.current.pending = false
        return
      }
      setPlayers(current => current.map(player => player.id === event.attackerId ? {
        ...player,
        attack,
        target: { current: { ...player.target.current, rotation: event.rotation } },
      } : player))
    }
    const onAttackRejected = () => clearAttackCameraState()
    const onCombatHit = event => {
      const feedback = { id: ++feedbackSequence.current, damage: event.damage, defeated: event.defeated }
      if (event.targetId === socket.id) { setLocalHp(event.hp); setLocalDamageFeedback(feedback); return }
      setPlayers(current => current.map(player => player.id === event.targetId ? { ...player, hp: event.hp, damageFeedback: feedback } : player))
    }
    const onDeath = event => {
      if (event.playerId === socket.id) {
        setLocalHp(0)
        setLocalAlive(false)
        setLocalRespawnPosition(null)
        clearAttackCameraState(true)
        mobileInputRef.current = { x: 0, y: 0, sprint: false }
        return
      }
      setPlayers(current => current.map(player => player.id !== event.playerId ? player : {
        ...player,
        hp: 0,
        alive: false,
        attack: null,
        killerId: event.killerId,
        diedAt: event.diedAt,
        target: { current: { ...player.target.current, position: event.position ? { ...event.position } : player.target.current.position, rotation: event.rotation ?? player.target.current.rotation, animation: 'death' } },
      }))
    }
    const onRespawn = event => {
      if (event.playerId === socket.id) {
        setLocalHp(event.hp)
        setLocalAlive(true)
        setLocalRespawnPosition({ ...event.position })
        setLocalDamageFeedback(null)
        clearAttackCameraState(true)
        return
      }
      setPlayers(current => current.map(player => player.id !== event.playerId ? player : {
        ...player,
        hp: event.hp,
        alive: true,
        attack: null,
        damageFeedback: null,
        diedAt: null,
        target: { current: { ...player.target.current, position: { ...event.position }, rotation: event.rotation, animation: event.animation || 'idle' } },
      }))
    }
    const onLeft = id => setPlayers(current => current.filter(player => player.id !== id))
    const onChat = message => setMessages(current => [...current, message])
    const onSystem = message => setMessages(current => [...current, { ...message, system: true }])
    socket.on('connect', onConnect); socket.on('disconnect', onDisconnect); socket.on('connect_error', onConnectError)
    socket.on('players:existing', onExisting); socket.on('player:joined', onJoin); socket.on('player:moved', onMove); socket.on('player:left', onLeft)
    socket.on('combat:attackStarted', onAttackStarted); socket.on('combat:attackRejected', onAttackRejected); socket.on('combat:hit', onCombatHit); socket.on('combat:death', onDeath); socket.on('player:respawn', onRespawn)
    socket.on('chat:message', onChat); socket.on('system:message', onSystem)
    if (name) socket.connect()
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('connect_error', onConnectError); socket.off('players:existing', onExisting); socket.off('player:joined', onJoin); socket.off('player:moved', onMove); socket.off('player:left', onLeft); socket.off('combat:attackStarted', onAttackStarted); socket.off('combat:attackRejected', onAttackRejected); socket.off('combat:hit', onCombatHit); socket.off('combat:death', onDeath); socket.off('player:respawn', onRespawn); socket.off('chat:message', onChat); socket.off('system:message', onSystem) }
  }, [name, characterId, clearAttackCameraState])
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
    const toggle = event => {
      if (['INPUT','TEXTAREA'].includes(event.target?.tagName)) return
      if (event.code === 'KeyM') setDebugMap(value => !value)
      if (event.code === 'KeyB') setCombatDebug(value => !value)
    }
    addEventListener('keydown', toggle)
    return () => removeEventListener('keydown', toggle)
  }, [])
  const enter = (playerName, selectedCharacterId) => { setCharacterId(selectedCharacterId); setName(playerName); setConnecting(true); setWorldReady(false) }
  const requestAttack = useCallback(() => {
    if (!connected || !worldReady || !localAlive || chatActive) return
    setAttackPending(true)
    attackIntentRef.current = { pending: true, requestedAt: performance.now() }
  }, [chatActive, connected, localAlive, worldReady])
  const sendAttack = useCallback((facingYaw) => {
    if (!connected || !worldReady || !localAlive || chatActive) return
    if (localPlayerStateRef.current) socket.emit('player:move', { ...localPlayerStateRef.current, rotation: facingYaw })
    socket.emit('combat:attack', { rotation: facingYaw })
  }, [chatActive, connected, localAlive, worldReady])
  const openChat = () => { mobileInputRef.current = { x: 0, y: 0, sprint: false }; setChatOpen(true); setChatActive(true); setChatFocusSignal(value => value + 1) }
  const closeChat = () => { setChatActive(false); if (mobileMode) setChatOpen(false); mobileInputRef.current = { x: 0, y: 0, sprint: false } }
  useEffect(() => { if (chatActive) clearAttackCameraState() }, [chatActive, clearAttackCameraState])
  const onWorldReady = useCallback(() => setWorldReady(true), [])
  if (!name) return <main className="game"><StartScreen onPlay={enter}/></main>
  return <main className={`game${mobileMode ? ' mobile-preview' : ''}`}>
    <Canvas shadows camera={{ position: [WORLD_MAP.spawn.x, terrainHeight(WORLD_MAP.spawn.x,WORLD_MAP.spawn.z)+CAMERA_CONFIG.explorationHeight, WORLD_MAP.spawn.z+CAMERA_CONFIG.explorationDistance], fov: 55, near: 0.1, far: 1800 }} dpr={[1, 1.5]}>
      <color attach="background" args={['#8fd3ff']} /><fog attach="fog" args={['#a9dcf3', 240, 900]} />
      <Sky distance={450000} sunPosition={[80,120,40]} turbidity={7} rayleigh={1.2}/><ambientLight intensity={1.1}/>
      <hemisphereLight args={['#d8f1ff','#5d7d3e',1.4]}/><directionalLight castShadow position={[80,120,60]} intensity={2.4} shadow-mapSize={[2048,2048]} shadow-camera-left={-80} shadow-camera-right={80} shadow-camera-top={80} shadow-camera-bottom={-80}/>
      <World name={name} characterId={characterId} socket={socket} connected={connected} playerList={players} onReady={onWorldReady} debugMap={debugMap} combatDebug={combatDebug} mobileInputRef={mobileInputRef} localAttackRef={localAttackRef} localPlayerStateRef={localPlayerStateRef} attackIntentRef={attackIntentRef} localHp={localHp} localAlive={localAlive} localRespawnPosition={localRespawnPosition} localDamageFeedback={localDamageFeedback} onAttack={requestAttack} onAttackReady={sendAttack} onAttackFinished={finishLocalAttack} combatMode={combatMode} mobileControls={mobileMode} chatOpen={chatOpen} chatActive={chatActive}/>
    </Canvas>
    {!worldReady && <div className="world-loading"><div className="loading-card"><div className="loading-spinner"/><span>Preparing {WORLD_MAP.displayName}</span><small>Loading the world…</small></div></div>}
    {!localAlive && <div className="death-overlay" role="status" aria-live="polite"><strong>YOU DIED</strong><span>Respawning…</span></div>}
    {combatMode && localAlive && !chatActive && <div className="combat-reticle" aria-label="Attack aim direction"><i/><i/><i/><i/></div>}
    <section className="hud"><strong>{WORLD_MAP.displayName}</strong>{!mobileMode && <><span>WASD / Arrow Keys — move · Shift — sprint · Left click — attack</span><span>Right mouse drag — orbit camera · / — chat</span></>}<span>{players.length + 1} players in world</span>{import.meta.env.DEV&&<><span>M — {debugMap?'hide':'show'} map markers · B — {combatDebug?'hide':'show'} combat debug</span><span>Combat debug: {combatDebug ? 'ON' : 'OFF'}</span></>}</section>
    <div className={`connection ${connected ? 'online' : ''}`}><i/>{connected ? 'Connected' : connecting ? 'Connecting…' : 'Disconnected'}</div>
    <Chat socket={socket} messages={messages} connected={connected} open={mobileMode ? chatOpen : true} active={chatActive} onOpen={openChat} onClose={closeChat} focusSignal={chatFocusSignal} mobile={mobileMode}/>
    {mobileMode && <MobileControls inputRef={mobileInputRef} onOpenChat={openChat} onAttack={requestAttack} attackDisabled={!connected || !localAlive || chatActive} gameplayDisabled={!localAlive} disabled={!worldReady || chatOpen}/>}
    {import.meta.env.DEV && <button className={`mobile-mode-toggle${mobileMode ? ' active' : ''}`} type="button" onClick={() => {
      setForceMobileMode(value => !value)
      setChatOpen(false)
      setChatActive(false)
      mobileInputRef.current = { x: 0, y: 0, sprint: false }
    }}>{forceMobileMode ? 'Exit mobile test' : 'Test mobile controls'}</button>}
  </main>
}
