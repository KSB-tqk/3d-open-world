import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, OrbitControls, useProgress } from '@react-three/drei'
import { CHARACTERS, DEFAULT_CHARACTER_ID } from '../characters/registry.js'
import CharacterVisual from '../components/CharacterVisual.jsx'

const STORAGE_KEY = 'sunmeadow-character-id'
const getSavedCharacter = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return CHARACTERS.some(character => character.id === saved) ? saved : DEFAULT_CHARACTER_ID
  } catch { return DEFAULT_CHARACTER_ID }
}

function Preview({ characterId }) {
  return <Canvas camera={{ position: [0, 1.65, 7], fov: 32 }} dpr={[1, 1.5]}>
    <color attach="background" args={['#d9eee4']} />
    <ambientLight intensity={1.8}/><directionalLight position={[4, 7, 5]} intensity={2.4} castShadow/>
    <group position={[0, -1.35, 0]}>
      <CharacterVisual key={characterId} characterId={characterId} preview fallback={null}/>
      <ContactShadows position={[0, 0, 0]} opacity={.28} scale={5} blur={2.5} far={3}/>
    </group>
    <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 2.5} maxPolarAngle={Math.PI / 2.05} autoRotate autoRotateSpeed={1.1}/>
  </Canvas>
}

export default function StartScreen({ onPlay }) {
  const { active: modelLoading } = useProgress()
  const [name, setName] = useState('')
  const [selectedId, setSelectedId] = useState(getSavedCharacter)
  const [loading, setLoading] = useState(false)
  const selectedIndex = CHARACTERS.findIndex(character => character.id === selectedId)
  const selected = CHARACTERS[selectedIndex] || CHARACTERS[0]
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, selectedId) } catch {} }, [selectedId])
  const choose = index => setSelectedId(CHARACTERS[(index + CHARACTERS.length) % CHARACTERS.length].id)
  const submit = event => {
    event.preventDefault()
    const clean = name.trim().slice(0, 20)
    if (clean) { setLoading(true); onPlay(clean, selectedId) }
  }
  return <div className="start-screen"><form className="start-card selection-card" onSubmit={submit}>
    <header className="selection-heading"><span className="eyebrow">A new adventure awaits</span><h1>SUNMEADOW<br/>VALLEY</h1><p>CHOOSE YOUR CHARACTER</p></header>
    <div className="character-feature">
      <button type="button" className="character-arrow" aria-label="Previous character" onClick={() => choose(selectedIndex - 1)}>‹</button>
      <div className="character-preview"><Preview characterId={selected.id}/><span className="preview-badge">3D PREVIEW</span>{modelLoading && <span className="model-loading">Loading model…</span>}</div>
      <button type="button" className="character-arrow" aria-label="Next character" onClick={() => choose(selectedIndex + 1)}>›</button>
    </div>
    <div className="selected-character"><strong>{selected.name}</strong><span>{String(selectedIndex + 1).padStart(2, '0')} / {CHARACTERS.length}</span></div>
    <div className="character-grid" aria-label="Choose a character">
      {CHARACTERS.map((character, index) => <button type="button" key={character.id} className={`character-card${character.id === selectedId ? ' selected' : ''}`} onClick={() => choose(index)} aria-pressed={character.id === selectedId} title={character.name}>
        <span className="character-card-avatar">{character.name.split(' ').map(part => part[0]).join('').slice(0, 2)}</span><span>{character.name}</span>
      </button>)}
    </div>
    <label htmlFor="player-name">Player name</label>
    <input id="player-name" value={name} onChange={event => setName(event.target.value.slice(0, 20))} maxLength={20} placeholder="Enter your name" autoComplete="nickname" autoFocus />
    <button type="submit" disabled={!name.trim() || loading}>{loading ? 'LOADING…' : 'ENTER WORLD'}</button>
    <small>Use the arrows or select a character card · Up to 20 characters</small>
  </form></div>
}
