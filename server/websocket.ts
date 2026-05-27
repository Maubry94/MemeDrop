import WebSocket, { WebSocketServer } from 'ws'
import type { ConnectedUser, Drop } from '../shared/types.js'
import type {
  DropJob,
  MemeDropClient,
  MemeDropWebSocketMessage,
  MemeDropWebSocketServerOptions,
} from './types.js'

const IMAGE_DISPLAY_MS = 9000

const sendJson = (socket: WebSocket, payload: unknown) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

const parseClientMessage = (data: WebSocket.RawData): MemeDropWebSocketMessage | null => {
  const parsed = JSON.parse(data.toString()) as Partial<MemeDropWebSocketMessage>

  if (
    (parsed.type === 'drop-completed' || parsed.type === 'drop-stop') &&
    typeof parsed.dropId === 'string'
  ) {
    return parsed as MemeDropWebSocketMessage
  }

  if (parsed.type === 'client-state') {
    return {
      type: 'client-state',
      dropsEnabled: parsed.dropsEnabled,
    }
  }

  return null
}

export const createMemeDropWebSocketServer = ({
  server,
  serverKey,
}: MemeDropWebSocketServerOptions) => {
  const clients = new Map<WebSocket, MemeDropClient>()
  const wss = new WebSocketServer({ server, path: '/ws' })
  const globalQueue: Drop[] = []
  const targetedQueues = new Map<string, Drop[]>()
  const activeJobBySocket = new Map<WebSocket, DropJob>()
  const activeTargetJobs = new Map<string, DropJob>()
  let activeGlobalJob: DropJob | null = null

  const clearJobTimer = (job: DropJob) => {
    if (job.timer) {
      clearTimeout(job.timer)
      job.timer = null
    }
  }

  const getEligibleClients = () =>
    [...clients.entries()]
      .filter(([, client]) => client.userId)
      .map(([socket]) => socket)

  const getConnectedUsers = (): ConnectedUser[] => {
    const users = new Map<string, ConnectedUser>()

    for (const client of clients.values()) {
      if (!client.userId) {
        continue
      }

      const existing = users.get(client.userId)
      users.set(client.userId, {
        id: client.userId,
        name: client.userName || client.userId,
        avatarUrl: client.userAvatarUrl || null,
        connections: (existing?.connections ?? 0) + 1,
        dropsEnabled: Boolean((existing?.dropsEnabled ?? false) || client.dropsEnabled),
      })
    }

    return [...users.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  const broadcastConnectedUsers = () => {
    const connectedUsers = getConnectedUsers()

    for (const socket of clients.keys()) {
      sendJson(socket, {
        type: 'connected-users',
        users: connectedUsers,
      })
    }
  }

  const getClientsByUserId = (userId: string) =>
    [...clients.entries()]
      .filter(([, client]) => client.userId === userId)
      .map(([socket]) => socket)

  const hasBusyClient = (sockets: WebSocket[]) =>
    sockets.some((socket) => activeJobBySocket.has(socket))

  const sendClearToTargets = (job: DropJob) => {
    for (const socket of job.targets) {
      sendJson(socket, { type: 'clear-drop' })
    }
  }

  const startJob = (drop: Drop, targets: WebSocket[], scope: DropJob['scope']) => {
    const job: DropJob = {
      drop,
      targets: new Set(targets),
      done: new Set(),
      scope,
      targetUserId: drop.targetUserId ?? null,
      timer: null,
    }

    if (scope === 'global') {
      activeGlobalJob = job
    } else if (job.targetUserId) {
      activeTargetJobs.set(job.targetUserId, job)
    }

    for (const socket of targets) {
      activeJobBySocket.set(socket, job)
      sendJson(socket, {
        type: 'active-drop',
        drop,
      })
    }

    console.log(`Drop actif: ${drop.id} (${targets.length} client(s) ciblé(s)).`)

    const contentType = drop.contentType?.toLowerCase() ?? ''
    if (contentType.startsWith('image/')) {
      job.timer = setTimeout(() => {
        console.log(`Drop image terminé par timeout: ${drop.id}.`)
        finishJob(job, { sendClear: false })
      }, IMAGE_DISPLAY_MS)
    }

    return job
  }

  const finishJob = (job: DropJob, options: { sendClear?: boolean } = {}) => {
    clearJobTimer(job)

    if (options.sendClear) {
      sendClearToTargets(job)
    }

    for (const socket of job.targets) {
      activeJobBySocket.delete(socket)
    }

    if (job.scope === 'global') {
      activeGlobalJob = null
    } else if (job.targetUserId) {
      activeTargetJobs.delete(job.targetUserId)
    }

    scheduleDrops()
  }

  function scheduleDrops() {
    if (activeGlobalJob) {
      return
    }

    const eligibleClients = getEligibleClients()
    const busyClientExists = eligibleClients.some((socket) => activeJobBySocket.has(socket))

    if (globalQueue.length && !eligibleClients.length) {
      globalQueue.length = 0
      return
    }

    if (globalQueue.length && eligibleClients.length && !busyClientExists) {
      const nextDrop = globalQueue.shift()
      if (nextDrop) {
        startJob(nextDrop, eligibleClients, 'global')
      }
      return
    }

    if (globalQueue.length) {
      return
    }

    for (const [targetUserId, queue] of targetedQueues.entries()) {
      if (!queue.length || activeTargetJobs.has(targetUserId)) {
        continue
      }

      const targets = getClientsByUserId(targetUserId)
      if (!targets.length) {
        queue.shift()
        if (!queue.length) {
          targetedQueues.delete(targetUserId)
        }
        continue
      }

      if (hasBusyClient(targets)) {
        continue
      }

      const nextDrop = queue.shift()
      if (nextDrop) {
        startJob(nextDrop, targets, 'targeted')
      }
      if (!queue.length) {
        targetedQueues.delete(targetUserId)
      }
    }
  }

  const completeDropForClient = (socket: WebSocket, dropId: string) => {
    const job = activeJobBySocket.get(socket)
    if (!job || job.drop.id !== dropId) {
      return
    }

    job.done.add(socket)
    if (job.done.size >= job.targets.size) {
      console.log(`Drop terminé chez tous les clients ciblés: ${dropId}.`)
      finishJob(job, { sendClear: false })
    }
  }

  const stopActiveDropByOwner = (
    dropId: string,
    ownerId: string,
    options: { sendClear?: boolean } = {},
  ) => {
    const jobs = [activeGlobalJob, ...activeTargetJobs.values()].filter(
      (job): job is DropJob => Boolean(job),
    )
    const job = jobs.find((activeJob) => activeJob.drop.id === dropId)

    if (job) {
      const expectedOwnerId = job.drop.ownerId ?? job.drop.authorId
      if (expectedOwnerId !== ownerId) {
        console.warn(`Stop global refusé pour ${ownerId}: auteur attendu ${expectedOwnerId}.`)
        return false
      }

      console.log(`Drop stoppé globalement par l'auteur: ${dropId}.`)
      finishJob(job, { sendClear: options.sendClear ?? true })
      return true
    }

    const removeFromQueue = (queue: Drop[]) => {
      const index = queue.findIndex((drop) => drop.id === dropId)
      if (index === -1) {
        return false
      }

      const drop = queue[index]
      if (!drop) {
        return false
      }

      if ((drop.ownerId ?? drop.authorId) !== ownerId) {
        console.warn(`Stop global refusé pour ${ownerId}: auteur attendu ${drop.ownerId ?? drop.authorId}.`)
        return false
      }

      queue.splice(index, 1)
      return true
    }

    if (removeFromQueue(globalQueue)) {
      return true
    }

    for (const [targetUserId, queue] of targetedQueues.entries()) {
      if (removeFromQueue(queue)) {
        if (!queue.length) {
          targetedQueues.delete(targetUserId)
        }
        return true
      }
    }

    return false
  }

  const stopDropForEveryone = (socket: WebSocket, dropId: string) => {
    const client = clients.get(socket)
    if (!client?.userId) {
      return
    }

    stopActiveDropByOwner(dropId, client.userId)
  }

  wss.on('connection', (socket, request) => {
    const requestUrl = new URL(request.url ?? '/ws', `http://${request.headers.host}`)
    const requestKey = requestUrl.searchParams.get('key') ?? ''
    const userId = requestUrl.searchParams.get('userId') ?? ''
    const userName = requestUrl.searchParams.get('userName') ?? ''
    const userAvatarUrl = requestUrl.searchParams.get('userAvatarUrl') ?? ''

    if (serverKey && requestKey !== serverKey) {
      console.warn('Client MemeDrop refusé: clé invalide.')
      socket.close(1008, 'Invalid MemeDrop key')
      return
    }

    clients.set(socket, {
      userId,
      userName,
      userAvatarUrl,
      dropsEnabled: true,
    })
    console.log(`Client MemeDrop connecté (${clients.size} client(s)).`)
    sendJson(socket, { type: 'hello' })
    broadcastConnectedUsers()
    scheduleDrops()

    socket.on('message', (data) => {
      try {
        const message = parseClientMessage(data)
        if (!message) {
          return
        }

        if (message.type === 'drop-completed') {
          completeDropForClient(socket, message.dropId)
        }
        if (message.type === 'drop-stop') {
          stopDropForEveryone(socket, message.dropId)
        }
        if (message.type === 'client-state') {
          const client = clients.get(socket)
          if (client) {
            client.dropsEnabled = message.dropsEnabled !== false
            broadcastConnectedUsers()
          }
        }
      } catch (error) {
        console.error('Message client MemeDrop invalide:', error)
      }
    })

    socket.on('close', () => {
      const job = activeJobBySocket.get(socket)
      clients.delete(socket)

      if (job) {
        activeJobBySocket.delete(socket)
        job.targets.delete(socket)
        job.done.delete(socket)

        if (!job.targets.size) {
          console.log(`Drop annulé: plus aucun client cible (${job.drop.id}).`)
          finishJob(job, { sendClear: false })
        } else if (job.done.size >= job.targets.size) {
          finishJob(job, { sendClear: false })
        }
      }

      console.log(`Client MemeDrop déconnecté (${clients.size} client(s)).`)
      broadcastConnectedUsers()
      scheduleDrops()
    })
  })

  const broadcastDrop = (drop: Drop) => {
    if (drop.targetUserId) {
      const sentCount = getClientsByUserId(drop.targetUserId).length
      if (!sentCount) {
        return 0
      }

      const queue = targetedQueues.get(drop.targetUserId) ?? []
      queue.push(drop)
      targetedQueues.set(drop.targetUserId, queue)
      scheduleDrops()
      return sentCount
    }

    const sentCount = getEligibleClients().length
    if (!sentCount) {
      return 0
    }

    globalQueue.push(drop)
    scheduleDrops()
    return sentCount
  }

  return {
    clients,
    broadcastDrop,
    getConnectedUsers,
    stopDropByOwner: stopActiveDropByOwner,
    wss,
  }
}
