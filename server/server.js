import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { createServer as createViteServer } from 'vite'
import { CHARACTERS, DEFAULT_CHARACTER_ID } from '../src/characters/registry.js'
import { CAMERA_CONFIG, COMBAT_CONFIG, RESPAWN_DELAY_MS } from '../src/combat/combatConfig.js'
import { attackOverlapsPlayer, rayCapsuleDistance } from '../src/combat/hitbox.js'
import { getWeapon, RIFLE_ENABLED } from '../src/weapons/registry.js'
import { getPlayerSpawn, USE_TEST_BATTLEFIELD } from '../src/world/worldConfig.js'
import { terrainHeight } from '../src/components/terrain.js'
import { loadTestBattlefieldMap } from './testBattlefieldMap.js'
import { createTroopSystem } from './troopSystem.js'

const PORT = Number(process.env.PORT || 3001)
const players = new Map()
const allowedCharacterIds = new Set(CHARACTERS.map(character => character.id))
const httpServer = createServer()
const io = new Server(httpServer, { cors: { origin: process.env.CLIENT_ORIGIN || `http://localhost:${PORT}` } })
let attackSequence = 0

const cleanName = value => typeof value === 'string' ? value.trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 20) : ''
const validSnapshot = data => data && data.position && ['x','y','z'].every(key => Number.isFinite(data.position[key]) && Math.abs(data.position[key]) <= 510) && Number.isFinite(data.rotation) && typeof data.animation === 'string'
const validCombatState = player => player && player.position && ['x','y','z'].every(key => Number.isFinite(player.position[key]) && Math.abs(player.position[key]) <= 510) && Number.isFinite(player.rotation) && Number.isFinite(player.hp)
const toClientPlayer = player => ({ id: player.id, name: player.name, characterId: player.characterId, equippedWeaponId: player.equippedWeaponId, side: player.side, position: player.position, rotation: player.rotation, animation: player.animation, hp: player.hp, alive: player.alive, isBlocking: player.isBlocking })
const battlefield = USE_TEST_BATTLEFIELD ? await loadTestBattlefieldMap() : null
const normalizeAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle))
const angleDelta = (from, to) => normalizeAngle(to - from)
function acceptFacing(player, requestedRotation, now) {
  if (!Number.isFinite(requestedRotation)) return player.rotation
  const elapsed = Math.max(0, now - player.rotationUpdatedAt)
  const yawSpeed = now < player.attackUntil ? CAMERA_CONFIG.attackTurnSpeed : CAMERA_CONFIG.serverMaxRotationSpeed
  const maxTurn = elapsed / 1000 * yawSpeed + CAMERA_CONFIG.rotationAllowance
  const delta = angleDelta(player.rotation, requestedRotation)
  const accepted = normalizeAngle(player.rotation + Math.max(-maxTurn, Math.min(maxTurn, delta)))
  player.rotationUpdatedAt = now
  return accepted
}

function cancelAttack(player) {
  const attack = player?.activeAttack
  if (!attack) return
  clearTimeout(attack.activeTimer)
  clearTimeout(attack.recoveryTimer)
  clearInterval(attack.scanTimer)
  player.activeAttack = null
  player.attackUntil = 0
}

function assignSide() {
  if (!USE_TEST_BATTLEFIELD) return null
  const counts = { A: 0, B: 0 }
  for (const player of players.values()) if (player.side in counts) counts[player.side]++
  if (!counts.A) return 'A'
  if (!counts.B) return 'B'
  return counts.A <= counts.B ? 'A' : 'B'
}

function getSpawnPosition(side, playerId) {
  if (USE_TEST_BATTLEFIELD && battlefield) {
    const marker = battlefield.positions[`Spawn_${side || 'A'}`]
    return { x: marker.x, y: marker.y, z: marker.z }
  }
  const fallback = getPlayerSpawn(playerId)
  return { x: fallback.x, y: terrainHeight(fallback.x, fallback.z), z: fallback.z }
}

function findAttackTargets(attacker, attack) {
  const hitboxAttacker = { ...attacker, rotation: attack.rotation }
  const targets = [...players.values()]
    .filter(target => target.id !== attacker.id && target.alive && target.hp > 0 &&
      !attack.hitTargets.has(`player:${target.id}`) && validCombatState(target) && attackOverlapsPlayer(hitboxAttacker, target))
    .map(entity => ({ kind: 'player', entity }))
  for (const entity of troopSystem.getTroops().values()) {
    if (!entity.alive || entity.hp <= 0 || entity.team === attacker.side || !attackOverlapsPlayer(hitboxAttacker, entity)) continue
    if (!attack.hitTargets.has(`troop:${entity.id}`)) targets.push({ kind: 'troop', entity })
  }
  return targets.sort((a, b) => Math.hypot(a.entity.position.x - attacker.position.x, a.entity.position.z - attacker.position.z) -
    Math.hypot(b.entity.position.x - attacker.position.x, b.entity.position.z - attacker.position.z))
}

function blocksFromFront(target, attacker) {
  if (!target.isBlocking) return false
  const dx = attacker.position.x - target.position.x
  const dz = attacker.position.z - target.position.z
  const distance = Math.hypot(dx, dz)
  if (distance < 1e-5) return true
  const facingX = Math.sin(target.rotation)
  const facingZ = Math.cos(target.rotation)
  const facingDot = (facingX * dx + facingZ * dz) / distance
  return facingDot >= Math.cos(COMBAT_CONFIG.blockFacingHalfAngleDegrees * Math.PI / 180)
}

function damagePlayer(attacker, target, requestedDamage, attackId) {
  if (!target.alive || target.hp <= 0) return
  const previousHp = target.hp
  const damage = Math.min(requestedDamage, previousHp)
  target.hp = Math.max(0, target.hp - damage)
  const defeated = target.hp === 0
  io.emit('combat:hit', { attackerId: attacker.id, attackId, targetId: target.id, damage, hp: target.hp, defeated })
  console.info(`[Combat] ${target.name} HP: ${previousHp} -> ${target.hp}`)
  if (!defeated) return

  target.alive = false
  target.isAiming = false
  target.isBlocking = false
  target.animation = 'death'
  target.diedAt = Date.now()
  cancelAttack(target)
  io.emit('combat:death', { playerId: target.id, killerId: attacker.id, diedAt: target.diedAt, position: target.position, rotation: target.rotation, hp: 0, alive: false })
  console.info(`[Death] ${target.name} died; killer ${attacker.name}`)
  target.respawnTimer = setTimeout(() => {
    if (players.get(target.id) !== target || target.alive) return
    target.position = getSpawnPosition(target.side, target.id)
    target.rotation = 0
    target.rotationUpdatedAt = Date.now()
    target.animation = 'idle'
    target.hp = COMBAT_CONFIG.maxHp
    target.alive = true
    target.isAiming = false
    target.isBlocking = false
    target.diedAt = null
    target.respawnTimer = null
    io.emit('player:respawn', { playerId: target.id, side: target.side, position: target.position, rotation: target.rotation, animation: target.animation, hp: target.hp, alive: true })
    console.info(`[Respawn] ${target.name} -> spawn`)
  }, RESPAWN_DELAY_MS)
}

const troopSystem = createTroopSystem({ io, players, battlefield, getTerrainHeight: terrainHeight, damagePlayer })
troopSystem.start()

io.on('connection', socket => {
  let chatReadyAt = 0
  socket.on('player:join', ({ name, characterId } = {}) => {
    if (players.has(socket.id)) return
    const safeName = cleanName(name)
    if (!safeName) { socket.emit('player:error', 'Please enter a valid player name.'); return }
    const side = assignSide()
    const spawn = getSpawnPosition(side, socket.id)
    const player = { id: socket.id, name: safeName, characterId: allowedCharacterIds.has(characterId) ? characterId : DEFAULT_CHARACTER_ID, equippedWeaponId: RIFLE_ENABLED ? 'rifle' : null, side, isAiming: false, isBlocking: false, position: spawn, rotation: 0, rotationUpdatedAt: Date.now(), animation: 'idle', hp: COMBAT_CONFIG.maxHp, alive: true, respawnTimer: null, lastAttackAt: 0, lastWeaponFireAt: 0, attackUntil: 0, activeAttack: null, nextTroopSpawnAt: 0 }
    socket.data.playerId = socket.id
    players.set(socket.id, player)
    const existing = [...players.values()].filter(p => p.id !== socket.id).map(toClientPlayer)
    socket.emit('players:existing', existing)
    socket.emit('player:spawn', { playerId: player.id, side: player.side, position: player.position })
    socket.emit('troops:snapshot', { serverTime: Date.now(), troops: [...troopSystem.getTroops().values()].map(troop => ({ id: troop.id, ownerId: troop.ownerId, team: troop.team, position: troop.position, yaw: troop.yaw, hp: troop.hp, maxHp: troop.maxHp, state: troop.state, targetId: troop.targetId, formationIndex: troop.formationIndex, attackSequence: troop.attackSequence, attackStartedAt: troop.attackStartedAt, alive: troop.alive })) })
    socket.broadcast.emit('player:joined', toClientPlayer(player))
    io.emit('system:message', { message: `${safeName} joined the world.`, timestamp: Date.now() })
  })
  socket.on('player:move', data => {
    const player = players.get(socket.id)
    if (!player || !player.alive || !validSnapshot(data)) return
    const now = Date.now()
    Object.assign(player, { position: data.position, rotation: acceptFacing(player, data.rotation, now) })
    if (player.activeAttack && ['windup', 'active'].includes(player.activeAttack.phase)) player.activeAttack.rotation = player.rotation
    const movementAnimation = ['idle','walk','run'].includes(data.animation) ? data.animation : 'idle'
    player.animation = Date.now() < player.attackUntil ? 'attack' : movementAnimation
    socket.broadcast.emit('player:moved', { id: player.id, characterId: player.characterId, position: player.position, rotation: player.rotation, animation: player.animation, isBlocking: player.isBlocking })
  })
  socket.on('troops:spawnRequest', () => troopSystem.requestSpawn(socket, players.get(socket.id)))
  socket.on('combat:block', ({ blocking } = {}) => {
    const player = players.get(socket.id)
    if (!player) return
    const nextBlocking = player.alive && player.hp > 0 && blocking === true
    if (player.isBlocking === nextBlocking) return
    if (nextBlocking) {
      cancelAttack(player)
      player.animation = 'idle'
    }
    player.isBlocking = nextBlocking
    io.emit('combat:blockState', { playerId: player.id, isBlocking: player.isBlocking })
  })
  socket.on('combat:attack', ({ rotation } = {}) => {
    const attacker = players.get(socket.id), now = Date.now()
    if (!validCombatState(attacker) || !attacker.alive || attacker.hp <= 0 || attacker.isBlocking || now - attacker.lastAttackAt < COMBAT_CONFIG.attackCooldownMs) {
      socket.emit('combat:attackRejected')
      return
    }
    if (Number.isFinite(rotation)) {
      const requestedFacing = acceptFacing(attacker, rotation, now)
      if (Math.abs(angleDelta(attacker.rotation, requestedFacing)) > CAMERA_CONFIG.rotationAllowance + 0.05) {
        socket.emit('combat:attackRejected')
        return
      }
      attacker.rotation = requestedFacing
    }
    attacker.lastAttackAt = now
    attacker.attackUntil = now + COMBAT_CONFIG.attackAnimationMs
    attacker.animation = 'attack'
    const attackId = ++attackSequence
    const attack = { id: attackId, phase: 'windup', rotation: attacker.rotation, hitTargets: new Set(), activeTimer: null, recoveryTimer: null, scanTimer: null }
    attacker.activeAttack = attack
    io.emit('combat:attackStarted', {
      attackerId: attacker.id,
      attackId,
      rotation: attack.rotation,
      durationMs: COMBAT_CONFIG.attackAnimationMs,
      windupMs: COMBAT_CONFIG.attackWindupMs,
      activeMs: COMBAT_CONFIG.attackActiveMs,
      recoveryMs: COMBAT_CONFIG.attackRecoveryMs,
    })
    const scanActiveHitbox = () => {
      if (players.get(attacker.id) !== attacker || !attacker.alive || attacker.activeAttack !== attack || attack.phase !== 'active') return
      if (!validCombatState(attacker) || !attacker.alive || attacker.hp <= 0) return
      for (const target of findAttackTargets(attacker, attack)) {
        const hitKey = target.kind === 'troop' ? `troop:${target.entity.id}` : `player:${target.entity.id}`
        attack.hitTargets.add(hitKey)
        const victim = target.entity
        if (!victim.alive || victim.hp <= 0) continue
        if (target.kind === 'player' && blocksFromFront(victim, attacker)) {
          io.emit('combat:blocked', { attackerId: attacker.id, attackId, targetId: victim.id })
          continue
        }
        if (target.kind === 'troop') troopSystem.damageTroop(attacker.id, victim, COMBAT_CONFIG.attackDamage, attackId)
        else damagePlayer(attacker, victim, COMBAT_CONFIG.attackDamage, attackId)
      }
    }
    attack.activeTimer = setTimeout(() => {
      if (players.get(attacker.id) !== attacker || attacker.activeAttack !== attack) return
      attack.phase = 'active'
      scanActiveHitbox()
      attack.scanTimer = setInterval(scanActiveHitbox, 40)
      attack.recoveryTimer = setTimeout(() => {
        clearInterval(attack.scanTimer)
        attack.phase = 'recovery'
        if (attacker.activeAttack === attack) attacker.activeAttack = null
      }, COMBAT_CONFIG.attackActiveMs)
    }, COMBAT_CONFIG.attackWindupMs)
  })
  socket.on('weapon:aim', ({ aiming } = {}) => {
    const player = players.get(socket.id)
    if (player) player.isAiming = RIFLE_ENABLED && player.alive && player.hp > 0 && aiming === true
  })
  socket.on('weapon:fire', ({ weaponId, direction, visualOrigin } = {}) => {
    if (!RIFLE_ENABLED) return
    const shooter = players.get(socket.id)
    const now = Date.now()
    const weapon = getWeapon(weaponId)
    if (!validCombatState(shooter) || !shooter.alive || shooter.hp <= 0 || !shooter.isAiming || !weapon || weapon.type !== 'firearm' || shooter.equippedWeaponId !== weapon.id || now - shooter.lastWeaponFireAt < weapon.fireIntervalMs) return
    if (!direction || !['x', 'y', 'z'].every(key => Number.isFinite(direction[key]))) return
    const length = Math.hypot(direction.x, direction.y, direction.z)
    if (length < 0.9 || length > 1.1) return
    const shotDirection = { x: direction.x / length, y: direction.y / length, z: direction.z / length }
    const facing = { x: Math.sin(shooter.rotation), z: Math.cos(shooter.rotation) }
    const horizontalLength = Math.hypot(shotDirection.x, shotDirection.z)
    if (horizontalLength > 1e-5 && (shotDirection.x * facing.x + shotDirection.z * facing.z) / horizontalLength < -0.25) return
    shooter.lastWeaponFireAt = now

    // The server has no animated skeleton. This stable chest-height origin is
    // used for authoritative damage; the client muzzle remains visual only.
    const shotOrigin = {
      x: shooter.position.x + facing.x * 0.35,
      y: shooter.position.y + 1.65,
      z: shooter.position.z + facing.z * 0.35,
    }
    const intersections = [...players.values()]
      .filter(target => target.id !== shooter.id && target.alive && target.hp > 0 && validCombatState(target))
      .map(target => ({ target, distance: rayCapsuleDistance(shotOrigin, shotDirection, target) }))
      .filter(hit => hit.distance !== null && hit.distance <= weapon.range)
      .sort((a, b) => a.distance - b.distance)
    const nearest = intersections[0]
    const endDistance = nearest?.distance ?? weapon.range
    const endPoint = {
      x: shotOrigin.x + shotDirection.x * endDistance,
      y: shotOrigin.y + shotDirection.y * endDistance,
      z: shotOrigin.z + shotDirection.z * endDistance,
    }
    const candidateVisualOrigin = visualOrigin && ['x', 'y', 'z'].every(key => Number.isFinite(visualOrigin[key]) && Math.abs(visualOrigin[key]) <= 510) ? visualOrigin : null
    const visualFrom = candidateVisualOrigin && Math.hypot(candidateVisualOrigin.x - shotOrigin.x, candidateVisualOrigin.y - shotOrigin.y, candidateVisualOrigin.z - shotOrigin.z) <= 4.5 ? candidateVisualOrigin : shotOrigin
    io.emit('weapon:fired', { shooterId: shooter.id, weaponId: weapon.id, from: visualFrom, to: endPoint })
    if (nearest) damagePlayer(shooter, nearest.target, weapon.damage, `rifle-${now}-${shooter.id}`)
  })
  socket.on('chat:send', ({ message } = {}) => {
    const player = players.get(socket.id), now = Date.now()
    if (!player || now < chatReadyAt || typeof message !== 'string') return
    const cleanMessage = message.trim().slice(0, 200)
    if (!cleanMessage) return
    chatReadyAt = now + 650
    io.emit('chat:message', { playerId: player.id, name: player.name, message: cleanMessage, timestamp: now })
  })
  socket.on('disconnect', () => {
    const player = players.get(socket.id)
    if (!player) return
    clearTimeout(player.respawnTimer)
    cancelAttack(player)
    troopSystem.removeOwner(player.id)
    players.delete(socket.id)
    io.emit('player:left', socket.id)
    io.emit('system:message', { message: `${player.name} left the world.`, timestamp: Date.now() })
  })
})

if (process.env.SERVE_CLIENT === 'true') {
  const vite = await createViteServer({ server: { middlewareMode: true, appType: 'spa' } })
  httpServer.on('request', vite.middlewares)
}

httpServer.listen(PORT, '0.0.0.0', () => console.log(`Anime Grassland server listening on http://localhost:${PORT}`))
