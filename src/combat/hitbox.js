import { COMBAT_CONFIG } from './combatConfig.js'

// Shared mathematical collision check. The visual debug mesh uses the same
// centered, forward-facing box dimensions; meshes are never used for damage.
export function attackOverlapsPlayer(attacker, target) {
  const box = COMBAT_CONFIG.attackHitbox
  const hurtbox = COMBAT_CONFIG.playerHurtbox
  const dx = target.position.x - attacker.position.x
  const dz = target.position.z - attacker.position.z
  const sin = Math.sin(attacker.rotation)
  const cos = Math.cos(attacker.rotation)
  const localX = dx * cos - dz * sin
  const localZ = dx * sin + dz * cos
  const closestX = Math.max(-box.width / 2, Math.min(box.width / 2, localX))
  const nearZ = box.centerForward - box.depth / 2
  const farZ = box.centerForward + box.depth / 2
  const closestZ = Math.max(nearZ, Math.min(farZ, localZ))
  const xGap = localX - closestX
  const zGap = localZ - closestZ
  if (xGap * xGap + zGap * zGap > hurtbox.radius * hurtbox.radius) return false

  const attackBottom = attacker.position.y + box.minHeight
  const attackTop = attacker.position.y + box.maxHeight
  const targetBottom = target.position.y
  const targetTop = targetBottom + hurtbox.height
  return attackBottom <= targetTop && attackTop >= targetBottom
}

export function getAttackHitboxCenter(position, rotation) {
  const { centerForward } = COMBAT_CONFIG.attackHitbox
  return {
    x: position.x + Math.sin(rotation) * centerForward,
    y: position.y + (COMBAT_CONFIG.attackHitbox.minHeight + COMBAT_CONFIG.attackHitbox.maxHeight) / 2,
    z: position.z + Math.cos(rotation) * centerForward,
  }
}

export function rayCapsuleDistance(origin, direction, player) {
  const { radius, height } = COMBAT_CONFIG.playerHurtbox
  const bottom = { x: player.position.x, y: player.position.y + radius, z: player.position.z }
  const top = { x: player.position.x, y: player.position.y + Math.max(radius, height - radius), z: player.position.z }
  const ba = { x: top.x - bottom.x, y: top.y - bottom.y, z: top.z - bottom.z }
  const oa = { x: origin.x - bottom.x, y: origin.y - bottom.y, z: origin.z - bottom.z }
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z
  const segmentPosition = Math.max(0, Math.min(1, dot(oa, ba) / dot(ba, ba)))
  const nearestOnSegment = { x: bottom.x + ba.x * segmentPosition, y: bottom.y + ba.y * segmentPosition, z: bottom.z + ba.z * segmentPosition }
  const fromSegment = { x: origin.x - nearestOnSegment.x, y: origin.y - nearestOnSegment.y, z: origin.z - nearestOnSegment.z }
  if (dot(fromSegment, fromSegment) <= radius * radius) return 0
  const baba = dot(ba, ba), bard = dot(ba, direction), baoa = dot(ba, oa)
  const rdoa = dot(direction, oa), oaoa = dot(oa, oa)
  const aa = baba - bard * bard
  const bb = baba * rdoa - baoa * bard
  const cc = baba * oaoa - baoa * baoa - radius * radius * baba
  let best = Infinity
  const h = bb * bb - aa * cc
  if (Math.abs(aa) > 1e-8 && h >= 0) {
    const t = (-bb - Math.sqrt(h)) / aa
    const y = baoa + t * bard
    if (t >= 0 && y >= 0 && y <= baba) best = t
  }
  for (const center of [bottom, top]) {
    const oc = { x: origin.x - center.x, y: origin.y - center.y, z: origin.z - center.z }
    const b = dot(oc, direction), c = dot(oc, oc) - radius * radius
    const sphereH = b * b - c
    if (sphereH < 0) continue
    const root = Math.sqrt(sphereH)
    const near = -b - root
    const t = near >= 0 ? near : -b + root
    if (t >= 0 && t < best) best = t
  }
  return Number.isFinite(best) ? best : null
}
