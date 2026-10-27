import { attackOverlapsPlayer } from '../src/combat/hitbox.js'
import { COMBAT_CONFIG } from '../src/combat/combatConfig.js'
import { TROOP_CONFIG } from '../src/combat/troopConfig.js'

const { formationOffsets: OFFSETS } = TROOP_CONFIG
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const distance2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle))
const targetKey = (kind, id) => `${kind}:${id}`

function formationOffset(index) {
  if (index < OFFSETS.length) return OFFSETS[index]
  const extra = index - OFFSETS.length
  return {
    x: ((extra % 3) - 1) * 1.35,
    z: -5.25 - Math.floor(extra / 3) * 1.6,
  }
}

function formationPosition(owner, index, out = {}) {
  const { x, z } = formationOffset(index)
  const sin = Math.sin(owner.rotation), cos = Math.cos(owner.rotation)
  out.x = owner.position.x + x * cos + z * sin
  out.z = owner.position.z - x * sin + z * cos
  return out
}

export function createTroopSystem({ io, players, battlefield, getTerrainHeight, damagePlayer }) {
  const troops = new Map()
  let nextTroopId = 1
  let aiTimer = null
  let snapshotTimer = null
  const makeSnapshot = () => [...troops.values()].map(troop => ({
    id: troop.id,
    ownerId: troop.ownerId,
    team: troop.team,
    position: { ...troop.position },
    yaw: troop.yaw,
    hp: troop.hp,
    maxHp: troop.maxHp,
    state: troop.state,
    targetId: troop.targetId,
    formationIndex: troop.formationIndex,
    attackSequence: troop.attackSequence,
    attackStartedAt: troop.attackStartedAt,
    alive: troop.alive,
  }))
  const broadcastSnapshot = () => io.emit('troops:snapshot', { serverTime: Date.now(), troops: makeSnapshot() })
  const countOwnedAlive = ownerId => [...troops.values()].filter(troop => troop.ownerId === ownerId && troop.alive).length
  const groundHeight = (x, z, referenceY = Infinity) => battlefield?.groundHeight(x, z, referenceY) ?? getTerrainHeight(x, z)

  function requestSpawn(socket, player) {
    const now = Date.now()
    if (!player || players.get(socket.id) !== player || !player.alive || player.hp <= 0 || !['A', 'B'].includes(player.side)) {
      socket.emit('troops:spawnResult', { ok: false, reason: 'unavailable', message: 'Troops are unavailable right now.' })
      return
    }
    if (now < player.nextTroopSpawnAt) {
      const waitSeconds = Math.ceil((player.nextTroopSpawnAt - now) / 1000)
      socket.emit('troops:spawnResult', { ok: false, reason: 'cooldown', message: `Squad ready in ${waitSeconds}s.` })
      return
    }
    const remainingPlayer = TROOP_CONFIG.maxPerPlayer - countOwnedAlive(player.id)
    const remainingServer = TROOP_CONFIG.maxTotal - troops.size
    const spawnCount = Math.min(TROOP_CONFIG.squadSpawnCount, remainingPlayer, remainingServer)
    if (spawnCount <= 0) {
      const reason = remainingServer <= 0 ? 'server-cap' : 'player-cap'
      socket.emit('troops:spawnResult', { ok: false, reason, message: reason === 'server-cap' ? 'The battlefield troop limit is reached.' : 'Troop limit reached.' })
      return
    }

    player.nextTroopSpawnAt = now + TROOP_CONFIG.spawnCooldownMs
    const marker = battlefield?.positions?.[`Spawn_${player.side}`] || player.position
    const yaw = player.side === 'B' ? Math.PI : 0
    const usedSlots = new Set([...troops.values()].filter(troop => troop.ownerId === player.id).map(troop => troop.formationIndex))
    let nextSlot = 0
    for (let i = 0; i < spawnCount; i++) {
      while (usedSlots.has(nextSlot)) nextSlot++
      const formationIndex = nextSlot
      usedSlots.add(nextSlot++)
      const offset = formationPosition({ position: marker, rotation: yaw }, formationIndex)
      const troop = {
        id: `troop-${nextTroopId++}`,
        ownerId: player.id,
        team: player.side,
        position: { x: offset.x, y: groundHeight(offset.x, offset.z, marker.y) ?? marker.y, z: offset.z },
        yaw,
        hp: TROOP_CONFIG.hp,
        maxHp: TROOP_CONFIG.hp,
        state: 'FOLLOW',
        targetId: null,
        targetKind: null,
        formationIndex,
        alive: true,
        ownerWasAlive: player.alive,
        holdPosition: null,
        targetSearchAt: 0,
        nextAttackAt: 0,
        attackSequence: 0,
        attackStartedAt: 0,
        attackTargetId: null,
        attackHitAt: 0,
        attackResolved: true,
        attackUntil: 0,
        removeAt: 0,
      }
      troops.set(troop.id, troop)
    }
    socket.emit('troops:spawnResult', { ok: true, spawned: spawnCount, message: `Squad spawned: ${spawnCount} troop${spawnCount === 1 ? '' : 's'}.` })
    broadcastSnapshot()
  }

  function getTarget(troop, id = troop.targetId, kind = troop.targetKind) {
    if (!id || !kind) return null
    if (kind === 'player') {
      const player = players.get(id)
      return player?.alive && player.hp > 0 ? player : null
    }
    const target = troops.get(id)
    return target?.alive && target.hp > 0 ? target : null
  }

  function targetAllowed(troop, target, owner) {
    if (!target || target.team === troop.team || target.side === troop.team) return false
    if (owner?.alive) {
      return distance2d(owner.position, target.position) <= TROOP_CONFIG.maxChaseDistance &&
        distance2d(owner.position, troop.position) <= TROOP_CONFIG.commanderLeash
    }
    return Boolean(troop.holdPosition && distance2d(troop.holdPosition, target.position) <= TROOP_CONFIG.holdAggroRadius)
  }

  function chooseTarget(troop, owner, aliveTroops) {
    const candidates = []
    for (const player of players.values()) {
      if (!player.alive || player.hp <= 0 || player.side === troop.team || !player.position) continue
      const range = owner?.alive ? TROOP_CONFIG.aggroRadius : TROOP_CONFIG.holdAggroRadius
      if (distance2d(troop.position, player.position) > range || !targetAllowed(troop, player, owner)) continue
      candidates.push({ target: player, kind: 'player', distance: distance2d(troop.position, player.position) })
    }
    for (const other of aliveTroops) {
      if (other.id === troop.id || other.team === troop.team || !other.alive) continue
      const range = owner?.alive ? TROOP_CONFIG.aggroRadius : TROOP_CONFIG.holdAggroRadius
      if (distance2d(troop.position, other.position) > range || !targetAllowed(troop, other, owner)) continue
      candidates.push({ target: other, kind: 'troop', distance: distance2d(troop.position, other.position) })
    }
    candidates.sort((a, b) => a.distance - b.distance)
    return candidates[0] || null
  }

  function targetByKey(id) {
    if (!id) return null
    const split = id.indexOf(':')
    const kind = id.slice(0, split), rawId = id.slice(split + 1)
    if (kind === 'player') {
      const player = players.get(rawId)
      return player?.alive && player.hp > 0 ? player : null
    }
    const troop = troops.get(rawId)
    return troop?.alive && troop.hp > 0 ? troop : null
  }

  function damageTroop(attackerId, troop, damage, attackId) {
    if (!troop?.alive || troop.hp <= 0) return
    const previousHp = troop.hp
    troop.hp = Math.max(0, troop.hp - Math.min(damage, previousHp))
    const defeated = troop.hp === 0
    io.emit('troops:hit', { attackerId, attackId, targetId: troop.id, damage: previousHp - troop.hp, hp: troop.hp, defeated })
    if (!defeated) return
    troop.alive = false
    troop.state = 'DEAD'
    troop.targetId = null
    troop.targetKind = null
    troop.attackTargetId = null
    troop.attackUntil = 0
    troop.removeAt = Date.now() + TROOP_CONFIG.corpseLifetimeMs
    io.emit('troops:died', { troopId: troop.id, ownerId: troop.ownerId, position: troop.position, diedAt: Date.now(), removeAt: troop.removeAt })
  }

  function startAttack(troop, target, now) {
    troop.attackSequence++
    troop.attackStartedAt = now
    troop.attackTargetId = targetKey(troop.targetKind, target.id)
    troop.attackHitAt = now + COMBAT_CONFIG.attackWindupMs
    troop.attackResolved = false
    troop.attackUntil = now + COMBAT_CONFIG.attackAnimationMs
    troop.nextAttackAt = now + TROOP_CONFIG.attackCooldownMs
  }

  function updateAttackHit(troop, now) {
    if (troop.attackResolved || now < troop.attackHitAt) return
    troop.attackResolved = true
    const target = targetByKey(troop.attackTargetId)
    if (!target || target.side === troop.team || (target.team && target.team === troop.team)) return
    if (distance2d(troop.position, target.position) > TROOP_CONFIG.attackRange + 0.3) return
    const desiredYaw = Math.atan2(target.position.x - troop.position.x, target.position.z - troop.position.z)
    if (Math.abs(wrapAngle(desiredYaw - troop.yaw)) > 0.7) return
    const attack = { position: troop.position, rotation: troop.yaw }
    if (!attackOverlapsPlayer(attack, target)) return
    if (target.id && players.get(target.id) === target) {
      damagePlayer({ id: troop.id, name: `Side ${troop.team} Troop`, side: troop.team }, target, TROOP_CONFIG.damage, `${troop.id}-${troop.attackSequence}`)
    } else {
      damageTroop(troop.id, target, TROOP_CONFIG.damage, `${troop.id}-${troop.attackSequence}`)
    }
  }

  function moveTroop(troop, goal, dt, desiredSpeed, aliveTroops) {
    let dx = goal.x - troop.position.x, dz = goal.z - troop.position.z
    let distance = Math.hypot(dx, dz)
    if (distance < TROOP_CONFIG.arrivalRadius) {
      troop.state = 'FOLLOW'
      return false
    }
    dx /= distance
    dz /= distance
    let separationX = 0, separationZ = 0
    for (const other of aliveTroops) {
      if (other.id === troop.id || !other.alive || other.team !== troop.team) continue
      const sx = troop.position.x - other.position.x, sz = troop.position.z - other.position.z
      const separation = Math.hypot(sx, sz)
      if (separation > 1e-4 && separation < TROOP_CONFIG.separationRadius) {
        const strength = (TROOP_CONFIG.separationRadius - separation) / TROOP_CONFIG.separationRadius
        separationX += sx / separation * strength
        separationZ += sz / separation * strength
      }
    }
    dx += separationX * 0.8
    dz += separationZ * 0.8
    const adjustedLength = Math.hypot(dx, dz) || 1
    dx /= adjustedLength
    dz /= adjustedLength
    const catchup = distance > 10 ? 1.3 : distance > 5 ? 1.15 : 1
    const speed = desiredSpeed * catchup
    const moveDistance = Math.min(distance, speed * dt)
    const next = { x: troop.position.x + dx * moveDistance, z: troop.position.z + dz * moveDistance }
    const resolved = battlefield?.resolveMovement?.(troop.position, next) || next
    if (Math.hypot(resolved.x - troop.position.x, resolved.z - troop.position.z) < 0.015) return false
    const old = { ...troop.position }
    troop.position.x = clamp(resolved.x, -292, 292)
    troop.position.z = clamp(resolved.z, -292, 292)
    troop.position.y = groundHeight(troop.position.x, troop.position.z, old.y) ?? old.y
    troop.yaw = Math.atan2(dx, dz)
    return true
  }

  function update(now, dt) {
    const allTroops = [...troops.values()]
    const aliveTroops = allTroops.filter(troop => troop.alive)
    for (const troop of allTroops) {
      if (!troop.alive) {
        if (now >= troop.removeAt) troops.delete(troop.id)
        continue
      }
      const owner = players.get(troop.ownerId)
      if (!owner) { troops.delete(troop.id); continue }
      if (!owner.alive && troop.ownerWasAlive) {
        troop.holdPosition = { ...troop.position }
        troop.ownerWasAlive = false
        troop.targetId = null
        troop.targetKind = null
      } else if (owner.alive && !troop.ownerWasAlive) {
        troop.ownerWasAlive = true
        troop.holdPosition = null
        troop.state = 'FOLLOW'
      }

      updateAttackHit(troop, now)
      if (!owner.alive) {
        const target = troop.targetId ? getTarget(troop) : null
        if (!target || distance2d(troop.position, target.position) > TROOP_CONFIG.holdAggroRadius) {
          troop.targetId = null
          troop.targetKind = null
        }
        if (now >= troop.targetSearchAt) {
          troop.targetSearchAt = now + 200
          const chosen = chooseTarget(troop, null, aliveTroops)
          troop.targetId = chosen?.target.id || null
          troop.targetKind = chosen?.kind || null
        }
        const heldTarget = troop.targetId ? getTarget(troop) : null
        if (heldTarget && distance2d(troop.position, heldTarget.position) <= TROOP_CONFIG.attackRange && now >= troop.nextAttackAt && now >= troop.attackUntil) {
          troop.targetId = heldTarget.id
          troop.targetKind = heldTarget.team ? 'troop' : 'player'
          troop.yaw = Math.atan2(heldTarget.position.x - troop.position.x, heldTarget.position.z - troop.position.z)
          troop.state = 'ATTACK'
          startAttack(troop, heldTarget, now)
        } else troop.state = 'HOLD'
        continue
      }

      if (now >= troop.targetSearchAt) {
        troop.targetSearchAt = now + 150
        const existing = troop.targetId ? getTarget(troop) : null
        const existingKind = troop.targetKind
        if (!existing || !targetAllowed(troop, existing, owner) || distance2d(troop.position, existing.position) > TROOP_CONFIG.aggroRadius + 4) {
          troop.targetId = null
          troop.targetKind = null
          const chosen = chooseTarget(troop, owner, aliveTroops)
          troop.targetId = chosen?.target.id || null
          troop.targetKind = chosen?.kind || null
        } else troop.targetKind = existingKind
      }
      let target = troop.targetId ? getTarget(troop) : null
      if (target && distance2d(troop.position, owner.position) > TROOP_CONFIG.commanderLeash) {
        troop.targetId = null
        troop.targetKind = null
        target = null
      }
      const attackInProgress = now < troop.attackUntil
      if (target && distance2d(troop.position, owner.position) <= TROOP_CONFIG.commanderLeash && distance2d(troop.position, target.position) <= TROOP_CONFIG.attackRange) {
        troop.yaw = Math.atan2(target.position.x - troop.position.x, target.position.z - troop.position.z)
        troop.state = 'ATTACK'
        if (!attackInProgress && now >= troop.nextAttackAt) startAttack(troop, target, now)
        continue
      }
      if (target && attackInProgress) continue
      if (target) {
        troop.state = 'CHASE'
        const distance = distance2d(troop.position, target.position)
        const goal = { x: target.position.x, z: target.position.z }
        if (distance > TROOP_CONFIG.attackRange * 0.82) {
          const towardX = (target.position.x - troop.position.x) / distance
          const towardZ = (target.position.z - troop.position.z) / distance
          goal.x -= towardX * (TROOP_CONFIG.attackRange * 0.72)
          goal.z -= towardZ * (TROOP_CONFIG.attackRange * 0.72)
        }
        moveTroop(troop, goal, dt, TROOP_CONFIG.chaseSpeed, aliveTroops)
        continue
      }

      troop.targetId = null
      troop.targetKind = null
      const formation = formationPosition(owner, troop.formationIndex)
      const formationDistance = distance2d(troop.position, formation)
      if (formationDistance > TROOP_CONFIG.emergencyTeleportDistance) {
        troop.position.x = formation.x
        troop.position.z = formation.z
        troop.position.y = groundHeight(formation.x, formation.z, owner.position.y) ?? owner.position.y
        continue
      }
      troop.state = 'FOLLOW'
      if (formationDistance > TROOP_CONFIG.arrivalRadius) moveTroop(troop, formation, dt, TROOP_CONFIG.moveSpeed, aliveTroops)
    }
  }

  return {
    requestSpawn,
    getTroops: () => troops,
    damageTroop,
    removeOwner(ownerId) {
      let removed = false
      for (const [id, troop] of troops) if (troop.ownerId === ownerId) { troops.delete(id); removed = true }
      if (removed) broadcastSnapshot()
    },
    start() {
      if (!aiTimer) aiTimer = setInterval(() => {
        const now = Date.now()
        update(now, 1 / TROOP_CONFIG.aiTickRate)
      }, 1000 / TROOP_CONFIG.aiTickRate)
      if (!snapshotTimer) snapshotTimer = setInterval(broadcastSnapshot, 1000 / TROOP_CONFIG.snapshotRate)
      aiTimer.unref?.()
      snapshotTimer.unref?.()
    },
    stop() {
      clearInterval(aiTimer)
      clearInterval(snapshotTimer)
      aiTimer = null
      snapshotTimer = null
    },
    broadcastSnapshot,
  }
}
