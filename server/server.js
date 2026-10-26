import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { createServer as createViteServer } from 'vite'
import { CHARACTERS, DEFAULT_CHARACTER_ID } from '../src/characters/registry.js'
import { CAMERA_CONFIG, COMBAT_CONFIG, RESPAWN_DELAY_MS } from '../src/combat/combatConfig.js'
import { attackOverlapsPlayer } from '../src/combat/hitbox.js'
import { getPlayerSpawn } from '../src/world/worldConfig.js'
import { terrainHeight } from '../src/components/terrain.js'

const PORT = Number(process.env.PORT || 3001)
const players = new Map()
const allowedCharacterIds = new Set(CHARACTERS.map(character => character.id))
const httpServer = createServer()
const io = new Server(httpServer, { cors: { origin: process.env.CLIENT_ORIGIN || `http://localhost:${PORT}` } })
let attackSequence = 0

const cleanName = value => typeof value === 'string' ? value.trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 20) : ''
const validSnapshot = data => data && data.position && ['x','y','z'].every(key => Number.isFinite(data.position[key]) && Math.abs(data.position[key]) <= 510) && Number.isFinite(data.rotation) && typeof data.animation === 'string'
const validCombatState = player => player && player.position && ['x','y','z'].every(key => Number.isFinite(player.position[key]) && Math.abs(player.position[key]) <= 510) && Number.isFinite(player.rotation) && Number.isFinite(player.hp)
const toClientPlayer = player => ({ id: player.id, name: player.name, characterId: player.characterId, position: player.position, rotation: player.rotation, animation: player.animation, hp: player.hp, alive: player.alive })
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

function findAttackTargets(attacker, attack) {
  const hitboxAttacker = { ...attacker, rotation: attack.rotation }
  return [...players.values()]
    .filter(target => {
      return target.id !== attacker.id && target.alive && target.hp > 0 && !attack.hitTargets.has(target.id) &&
        validCombatState(target) && attackOverlapsPlayer(hitboxAttacker, target)
    })
    .sort((a, b) => Math.hypot(a.position.x - attacker.position.x, a.position.z - attacker.position.z) -
      Math.hypot(b.position.x - attacker.position.x, b.position.z - attacker.position.z))
}

io.on('connection', socket => {
  let chatReadyAt = 0
  socket.on('player:join', ({ name, characterId } = {}) => {
    if (players.has(socket.id)) return
    const safeName = cleanName(name)
    if (!safeName) { socket.emit('player:error', 'Please enter a valid player name.'); return }
    const spawn = getPlayerSpawn(socket.id)
    const player = { id: socket.id, name: safeName, characterId: allowedCharacterIds.has(characterId) ? characterId : DEFAULT_CHARACTER_ID, position: { x: spawn.x, y: terrainHeight(spawn.x, spawn.z), z: spawn.z }, rotation: 0, rotationUpdatedAt: Date.now(), animation: 'idle', hp: COMBAT_CONFIG.maxHp, alive: true, respawnTimer: null, lastAttackAt: 0, attackUntil: 0, activeAttack: null }
    socket.data.playerId = socket.id
    players.set(socket.id, player)
    const existing = [...players.values()].filter(p => p.id !== socket.id).map(toClientPlayer)
    socket.emit('players:existing', existing)
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
    socket.broadcast.emit('player:moved', { id: player.id, characterId: player.characterId, position: player.position, rotation: player.rotation, animation: player.animation })
  })
  socket.on('combat:attack', ({ rotation } = {}) => {
    const attacker = players.get(socket.id), now = Date.now()
    if (!validCombatState(attacker) || !attacker.alive || attacker.hp <= 0 || now - attacker.lastAttackAt < COMBAT_CONFIG.attackCooldownMs) {
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
        attack.hitTargets.add(target.id)
        if (!target.alive || target.hp <= 0) continue
        const previousHp = target.hp
        const damage = Math.min(COMBAT_CONFIG.attackDamage, previousHp)
        target.hp = Math.max(0, target.hp - COMBAT_CONFIG.attackDamage)
        const defeated = target.hp === 0
        io.emit('combat:hit', { attackerId: attacker.id, attackId, targetId: target.id, damage, hp: target.hp, defeated })
        console.info(`[Combat] ${target.name} HP: ${previousHp} -> ${target.hp}`)
        if (defeated && target.alive) {
          target.alive = false
          target.animation = 'death'
          target.diedAt = Date.now()
          cancelAttack(target)
          io.emit('combat:death', {
            playerId: target.id,
            killerId: attacker.id,
            diedAt: target.diedAt,
            position: target.position,
            rotation: target.rotation,
            hp: 0,
            alive: false,
          })
          console.info(`[Death] ${target.name} died; killer ${attacker.name}`)
          target.respawnTimer = setTimeout(() => {
            if (players.get(target.id) !== target || target.alive) return
            const respawn = getPlayerSpawn(target.id)
            target.position = { x: respawn.x, y: terrainHeight(respawn.x, respawn.z), z: respawn.z }
            target.rotation = 0
            target.rotationUpdatedAt = Date.now()
            target.animation = 'idle'
            target.hp = COMBAT_CONFIG.maxHp
            target.alive = true
            target.diedAt = null
            target.respawnTimer = null
            io.emit('player:respawn', {
              playerId: target.id,
              position: target.position,
              rotation: target.rotation,
              animation: target.animation,
              hp: target.hp,
              alive: true,
            })
            console.info(`[Respawn] ${target.name} -> spawn`)
          }, RESPAWN_DELAY_MS)
        }
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
