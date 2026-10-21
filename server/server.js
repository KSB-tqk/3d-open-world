import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { createServer as createViteServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { readdir } from 'node:fs/promises'

const PORT = Number(process.env.PORT || 3001)
const players = new Map()
const characterDirectory = fileURLToPath(new URL('../public/models/characters/', import.meta.url))
const allowedCharacterIds = new Set((await readdir(characterDirectory)).filter(file => file.endsWith('.gltf')).map(file => file.replace(/\.gltf$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '_')))
const DEFAULT_CHARACTER_ID = 'casual_male'
const httpServer = createServer()
const io = new Server(httpServer, { cors: { origin: process.env.CLIENT_ORIGIN || `http://localhost:${PORT}` } })

const cleanName = value => typeof value === 'string' ? value.trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 20) : ''
const validSnapshot = data => data && data.position && ['x','y','z'].every(key => Number.isFinite(data.position[key]) && Math.abs(data.position[key]) <= 510) && Number.isFinite(data.rotation) && typeof data.animation === 'string'

io.on('connection', socket => {
  let chatReadyAt = 0
  socket.on('player:join', ({ name, characterId } = {}) => {
    if (players.has(socket.id)) return
    const safeName = cleanName(name)
    if (!safeName) { socket.emit('player:error', 'Please enter a valid player name.'); return }
    const player = { id: socket.id, name: safeName, characterId: allowedCharacterIds.has(characterId) ? characterId : DEFAULT_CHARACTER_ID, position: { x: 0, y: 0, z: 0 }, rotation: 0, animation: 'idle' }
    socket.data.playerId = socket.id
    players.set(socket.id, player)
    const existing = [...players.values()].filter(p => p.id !== socket.id)
    socket.emit('players:existing', existing)
    socket.broadcast.emit('player:joined', player)
    io.emit('system:message', { message: `${safeName} joined the world.`, timestamp: Date.now() })
  })
  socket.on('player:move', data => {
    const player = players.get(socket.id)
    if (!player || !validSnapshot(data)) return
    Object.assign(player, { position: data.position, rotation: data.rotation, animation: ['idle','walk','run'].includes(data.animation) ? data.animation : 'idle' })
    socket.broadcast.emit('player:moved', { id: player.id, characterId: player.characterId, position: player.position, rotation: player.rotation, animation: player.animation })
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
