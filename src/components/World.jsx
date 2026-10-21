import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import Terrain from './Terrain.jsx'
import Scenery from './Scenery.jsx'
import Player from './Player.jsx'
import RemotePlayer from './RemotePlayer.jsx'
import SceneReady from './SceneReady.jsx'
import { WORLD_MAP } from '../world/worldConfig.js'
import { terrainHeight } from './terrain.js'

export default function World({ name, characterId, socket, connected, playerList, onReady, debugMap, mobileInputRef, mobileControls, chatOpen }) {
  const controls = useRef(), localState = useRef(null), lastSent = useRef(0)
  useFrame((_, dt) => {
    lastSent.current += dt
    if (connected && localState.current && lastSent.current >= .075) {
      socket.emit('player:move', localState.current)
      lastSent.current = 0
    }
  })
  return <>
    <Terrain/><Scenery debugMap={debugMap}/><Player controlsRef={controls} name={name} characterId={characterId} networkRef={localState} mobileInputRef={mobileInputRef} controlsDisabled={mobileControls && chatOpen}/>
    {playerList.map(player => <RemotePlayer key={player.id} player={player}/>)}
    <OrbitControls ref={controls} makeDefault enabled={!mobileControls || !chatOpen} enablePan={false} mouseButtons={{ LEFT: mobileControls ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }} minDistance={6} maxDistance={28} minPolarAngle={0.45} maxPolarAngle={1.35} target={[WORLD_MAP.spawn.x,terrainHeight(WORLD_MAP.spawn.x,WORLD_MAP.spawn.z)+2,WORLD_MAP.spawn.z]} />
    <SceneReady onReady={onReady}/>
  </>
}
