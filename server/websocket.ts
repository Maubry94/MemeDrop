import WebSocket, { WebSocketServer } from 'ws'
import type { ConnectedUser, Drop } from '../shared/types.js'
import { createDropScheduler } from './dropScheduler.js'
import type {
  MemeDropClient,
  MemeDropWebSocketMessage,
  MemeDropWebSocketServerOptions,
} from './types.js'

const HEARTBEAT_INTERVAL_MS = 30000

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
  latestAppVersion,
}: MemeDropWebSocketServerOptions) => {
  const clients = new Map<WebSocket, MemeDropClient>()
  const socketAlive = new WeakMap<WebSocket, boolean>()
  const wss = new WebSocketServer({ server, path: '/ws' })

  const getEligibleClients = () =>
    [...clients.entries()]
      .filter(([, client]) => client.userId)
      .map(([socket]) => socket)

  const getClientLogSummary = () =>
    `${clients.size} connexion(s), ${getEligibleClients().length} client(s) identifié(s)`

  const compareAppVersions = (currentVersion: string, expectedVersion: string) => {
    const currentParts = currentVersion.split(/[.-]/).map((part) => Number(part))
    const expectedParts = expectedVersion.split(/[.-]/).map((part) => Number(part))
    const partsLength = Math.max(currentParts.length, expectedParts.length)

    for (let index = 0; index < partsLength; index += 1) {
      const currentPart = currentParts[index] ?? 0
      const expectedPart = expectedParts[index] ?? 0

      if (!Number.isFinite(currentPart) || !Number.isFinite(expectedPart)) {
        return currentVersion.localeCompare(expectedVersion)
      }
      if (currentPart !== expectedPart) {
        return currentPart - expectedPart
      }
    }

    return 0
  }

  const isVersionOutdated = (appVersion: string) =>
    Boolean(appVersion) && compareAppVersions(appVersion, latestAppVersion) < 0

  const getConnectedUsers = (): ConnectedUser[] => {
    const users = new Map<string, ConnectedUser>()

    for (const client of clients.values()) {
      if (!client.userId) {
        continue
      }

      const existing = users.get(client.userId)
      const appVersions = Array.from(
        new Set([...(existing?.appVersions ?? []), client.appVersion].filter(Boolean)),
      ).sort((a, b) => compareAppVersions(b, a))

      users.set(client.userId, {
        id: client.userId,
        name: client.userName || client.userId,
        avatarUrl: client.userAvatarUrl || null,
        connections: (existing?.connections ?? 0) + 1,
        dropsEnabled: Boolean((existing?.dropsEnabled ?? false) || client.dropsEnabled),
        appVersion: appVersions[0] ?? null,
        appVersions,
        latestAppVersion,
        updateAvailable: appVersions.some(isVersionOutdated),
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
        latestAppVersion,
      })
    }
  }

  const getClientsByUserId = (userId: string) =>
    [...clients.entries()]
      .filter(([, client]) => client.userId === userId)
      .map(([socket]) => socket)

  const dropScheduler = createDropScheduler<WebSocket>({
    getEligibleTargets: getEligibleClients,
    getTargetsByUserId: getClientsByUserId,
    sendDrop: (socket, drop) => {
      sendJson(socket, {
        type: 'active-drop',
        drop,
      })
    },
    sendClear: (socket) => {
      sendJson(socket, { type: 'clear-drop' })
    },
    getLogSummary: getClientLogSummary,
  })

  const stopDropForEveryone = (socket: WebSocket, dropId: string) => {
    const client = clients.get(socket)
    if (!client?.userId) {
      return
    }

    dropScheduler.stopDropByOwner(dropId, client.userId)
  }

  wss.on('connection', (socket, request) => {
    const requestUrl = new URL(request.url ?? '/ws', `http://${request.headers.host}`)
    const requestKey = requestUrl.searchParams.get('key') ?? ''
    const userId = requestUrl.searchParams.get('userId') ?? ''
    const userName = requestUrl.searchParams.get('userName') ?? ''
    const userAvatarUrl = requestUrl.searchParams.get('userAvatarUrl') ?? ''
    const appVersion = requestUrl.searchParams.get('appVersion') ?? ''

    if (serverKey && requestKey !== serverKey) {
      console.warn('Client MemeDrop refusé: clé invalide.')
      socket.close(1008, 'Invalid MemeDrop key')
      return
    }

    clients.set(socket, {
      userId,
      userName,
      userAvatarUrl,
      appVersion,
      dropsEnabled: true,
    })
    socketAlive.set(socket, true)
    console.log(`Client MemeDrop connecté (${getClientLogSummary()}).`)
    sendJson(socket, { type: 'hello' })
    broadcastConnectedUsers()
    dropScheduler.scheduleDrops()

    socket.on('message', (data) => {
      try {
        const message = parseClientMessage(data)
        if (!message) {
          return
        }

        if (message.type === 'drop-completed') {
          dropScheduler.completeDropForTarget(socket, message.dropId)
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

    socket.on('pong', () => {
      socketAlive.set(socket, true)
    })

    socket.on('close', () => {
      clients.delete(socket)
      socketAlive.delete(socket)
      dropScheduler.removeTarget(socket)

      console.log(`Client MemeDrop déconnecté (${getClientLogSummary()}).`)
      broadcastConnectedUsers()
    })
  })

  const heartbeatTimer = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue
      }

      if (socketAlive.get(socket) === false) {
        socket.terminate()
        continue
      }

      socketAlive.set(socket, false)
      socket.ping()
    }
  }, HEARTBEAT_INTERVAL_MS)

  wss.on('close', () => {
    clearInterval(heartbeatTimer)
  })

  const broadcastDrop = (drop: Drop) => {
    return dropScheduler.enqueueDrop(drop)
  }

  return {
    clients,
    broadcastDrop,
    getConnectedUsers,
    stopDropByOwner: dropScheduler.stopDropByOwner,
    wss,
  }
}
