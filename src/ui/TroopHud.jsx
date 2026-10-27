import { useEffect, useState } from 'react'
import { TROOP_CONFIG } from '../combat/troopConfig.js'

export default function TroopHud({ socket, ownerId, mobileMode = false }) {
  const [troops, setTroops] = useState([])
  useEffect(() => {
    if (!socket) return undefined
    const onSnapshot = snapshot => setTroops(Array.isArray(snapshot?.troops) ? snapshot.troops : [])
    const onDisconnect = () => setTroops([])
    socket.on('troops:snapshot', onSnapshot)
    socket.on('disconnect', onDisconnect)
    return () => {
      socket.off('troops:snapshot', onSnapshot)
      socket.off('disconnect', onDisconnect)
    }
  }, [socket])
  const count = troops.reduce((sum, troop) => sum + (troop.ownerId === ownerId && troop.alive ? 1 : 0), 0)
  return <div className="troop-hud" aria-live="polite"><strong>Troops: {count} / {TROOP_CONFIG.maxPerPlayer}</strong>{mobileMode && <span>Tap TROOPS to spawn 5</span>}</div>
}
