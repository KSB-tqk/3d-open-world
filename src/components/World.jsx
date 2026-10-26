import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import Terrain from './Terrain.jsx'
import Scenery from './Scenery.jsx'
import Player from './Player.jsx'
import RemotePlayer from './RemotePlayer.jsx'
import SceneReady from './SceneReady.jsx'
import CatNPC from './CatNPC.jsx'
import { WORLD_MAP } from '../world/worldConfig.js'
import { terrainHeight } from './terrain.js'
import CombatDebug from '../combat/CombatDebug.jsx'
import { CAMERA_CONFIG } from '../combat/combatConfig.js'

export default function World({ name, characterId, socket, connected, playerList, onReady, debugMap, combatDebug, mobileInputRef, localAttackRef, localPlayerStateRef, attackIntentRef, localHp, localAlive, localRespawnPosition, localDamageFeedback, onAttack, onAttackReady, onAttackFinished, combatMode, mobileControls, chatOpen, chatActive }) {
  const controls = useRef(), fallbackState = useRef(null), lastSent = useRef(0)
  const localState = localPlayerStateRef || fallbackState
  useFrame((_, dt) => {
    lastSent.current += dt
    if (connected && localState.current && localState.current.alive !== false && lastSent.current >= .075) {
      socket.emit('player:move', localState.current)
      lastSent.current = 0
    }
  })
  return <>
    <Terrain/><Scenery debugMap={debugMap}/><Player controlsRef={controls} name={name} characterId={characterId} playerId={socket?.id || name} networkRef={localState} mobileInputRef={mobileInputRef} attackRef={localAttackRef} attackIntentRef={attackIntentRef} hp={localHp} alive={localAlive} respawnPosition={localRespawnPosition} damageFeedback={localDamageFeedback} onAttack={onAttack} onAttackReady={onAttackReady} onAttackFinished={onAttackFinished} combatMode={combatMode} mobileControls={mobileControls} controlsDisabled={!localAlive || chatActive || (mobileControls && chatOpen)}/>
    <CatNPC playerStateRef={localState} mobileControls={mobileControls} interactionDisabled={chatActive || !localAlive}/>
    {import.meta.env.DEV && <CombatDebug enabled={combatDebug} showAimDirection={CAMERA_CONFIG.showCombatAimDebug} getTransform={() => localState.current} getAttack={() => localAttackRef.current}/>}
    {playerList.map(player => <group key={player.id}><RemotePlayer player={player}/>{import.meta.env.DEV && <CombatDebug enabled={combatDebug} showAimDirection={CAMERA_CONFIG.showCombatAimDebug} getTransform={() => player.target.current} getAttack={() => player.attack}/>}</group>)}
    <OrbitControls ref={controls} makeDefault enabled={!mobileControls || !chatOpen} enablePan={false} mouseButtons={{ LEFT: mobileControls ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }} minDistance={CAMERA_CONFIG.explorationMinDistance} maxDistance={CAMERA_CONFIG.explorationMaxDistance} minPolarAngle={Math.PI / 2 - CAMERA_CONFIG.maxPitch} maxPolarAngle={Math.PI / 2 - CAMERA_CONFIG.minPitch} target={[WORLD_MAP.spawn.x,terrainHeight(WORLD_MAP.spawn.x,WORLD_MAP.spawn.z)+CAMERA_CONFIG.targetHeight,WORLD_MAP.spawn.z]} />
    <SceneReady onReady={onReady}/>
  </>
}
