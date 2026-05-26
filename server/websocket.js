import WebSocket, { WebSocketServer } from 'ws'

const IMAGE_DISPLAY_MS = 9000

const sendJson = (socket, payload) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

export const createMemeDropWebSocketServer = ({ server, serverKey }) => {
  const clients = new Map()
  const wss = new WebSocketServer({ server, path: '/ws' })
  const queue = []
  let activeDrop = null
  let activeTargets = new Set()
  let activeDone = new Set()
  let activeTimer = null

  const clearActiveTimer = () => {
    if (activeTimer) {
      clearTimeout(activeTimer)
      activeTimer = null
    }
  }

  const getEligibleClients = () =>
    [...clients.entries()]
      .filter(([, client]) => client.userId)
      .map(([socket]) => socket)

  const startNextDrop = () => {
    clearActiveTimer()
    activeDrop = null
    activeTargets = new Set()
    activeDone = new Set()

    const targets = getEligibleClients()
    if (!targets.length) {
      queue.length = 0
      return
    }

    const nextDrop = queue.shift()
    if (!nextDrop) {
      for (const socket of clients.keys()) {
        sendJson(socket, { type: 'clear-drop' })
      }
      return
    }

    activeDrop = nextDrop
    activeTargets = new Set(targets)

    for (const socket of targets) {
      sendJson(socket, {
        type: 'active-drop',
        drop: nextDrop,
      })
    }

    console.log(`Drop actif: ${nextDrop.id} (${activeTargets.size} client(s) ciblé(s)).`)

    const contentType = nextDrop.contentType?.toLowerCase() ?? ''
    if (contentType.startsWith('image/')) {
      activeTimer = setTimeout(() => {
        console.log(`Drop image terminé par timeout: ${nextDrop.id}.`)
        startNextDrop()
      }, IMAGE_DISPLAY_MS)
    }
  }

  const completeDropForClient = (socket, dropId) => {
    if (!activeDrop || activeDrop.id !== dropId || !activeTargets.has(socket)) {
      return
    }

    activeDone.add(socket)
    if (activeDone.size >= activeTargets.size) {
      console.log(`Drop terminé chez tous les clients: ${dropId}.`)
      startNextDrop()
    }
  }

  const stopDropForEveryone = (socket, dropId) => {
    const client = clients.get(socket)
    if (!activeDrop || activeDrop.id !== dropId || !client?.userId) {
      return
    }

    if (activeDrop.authorId !== client.userId) {
      console.warn(`Stop global refusé pour ${client.userId}: auteur attendu ${activeDrop.authorId}.`)
      return
    }

    console.log(`Drop stoppé globalement par l'auteur: ${dropId}.`)
    startNextDrop()
  }

  wss.on('connection', (socket, request) => {
    const requestUrl = new URL(request.url ?? '/ws', `http://${request.headers.host}`)
    const requestKey = requestUrl.searchParams.get('key') ?? ''
    const userId = requestUrl.searchParams.get('userId') ?? ''

    if (serverKey && requestKey !== serverKey) {
      console.warn('Client MemeDrop refusé: clé invalide.')
      socket.close(1008, 'Invalid MemeDrop key')
      return
    }

    clients.set(socket, {
      userId,
    })
    console.log(`Client MemeDrop connecté (${clients.size} client(s)).`)
    sendJson(socket, { type: 'hello' })

    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString())
        if (message.type === 'drop-completed') {
          completeDropForClient(socket, message.dropId)
        }
        if (message.type === 'drop-stop') {
          stopDropForEveryone(socket, message.dropId)
        }
      } catch (error) {
        console.error('Message client MemeDrop invalide:', error)
      }
    })

    socket.on('close', () => {
      clients.delete(socket)
      activeTargets.delete(socket)
      activeDone.delete(socket)
      console.log(`Client MemeDrop déconnecté (${clients.size} client(s)).`)
      if (activeDrop && activeTargets.size === 0) {
        console.log(`Drop annulé: plus aucun client cible (${activeDrop.id}).`)
        startNextDrop()
        return
      }
      if (activeDrop && activeDone.size >= activeTargets.size) {
        startNextDrop()
      }
    })
  })

  const broadcastDrop = (drop) => {
    const sentCount = getEligibleClients().length
    if (!sentCount) {
      return 0
    }

    queue.push(drop)
    if (!activeDrop) {
      startNextDrop()
    }
    return sentCount
  }

  return {
    clients,
    broadcastDrop,
    wss,
  }
}
