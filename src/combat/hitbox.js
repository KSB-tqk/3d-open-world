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
