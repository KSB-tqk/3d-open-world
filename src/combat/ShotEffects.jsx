import { Line } from '@react-three/drei'

export default function ShotEffects({ shots = [] }) {
  return shots.map(shot => <group key={shot.localId}>
    <Line points={[[shot.from.x, shot.from.y, shot.from.z], [shot.to.x, shot.to.y, shot.to.z]]} color="#fff0a8" lineWidth={2.2} transparent opacity={0.9} depthTest={false}/>
    <mesh position={[shot.from.x, shot.from.y, shot.from.z]}>
      <sphereGeometry args={[0.055, 6, 4]}/>
      <meshBasicMaterial color="#ffbc53" toneMapped={false}/>
    </mesh>
  </group>)
}
