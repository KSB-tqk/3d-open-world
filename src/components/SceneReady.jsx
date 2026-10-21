import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

export default function SceneReady({ onReady }) {
  const notified = useRef(false)
  useFrame(() => {
    if (!notified.current) { notified.current = true; onReady() }
  })
  return null
}
