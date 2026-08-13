import WebSocket, { WebSocketServer } from 'ws'
import type { ConnectedUser, Drop } from '../shared/types.js'
import { createDropScheduler } from './dropScheduler.js'
import { isAuthorizedRequest } from './http/authKey.js'
import { createTokenBucket } from './security/rateLimit.js'
import type {
  MemeDropClient,
  MemeDropWebSocketServerOptions,
} from './types.js'
import { parseClientMessage } from './websocketProtocol.js'

const HEARTBEAT_INTERVAL_MS = 30000
const MAX_CLIENT_MESSAGE_BYTES = 16 * 1024
const MAX_WEBSOCKET_CLIENTS = 128
const MAX_CONNECTIONS_PER_IDENTITY = 4
const MAX_SOCKET_MESSAGES_PER_BURST = 30
const SOCKET_MESSAGES_REFILL_PER_SECOND = 10
const MAX_SOCKET_BUFFERED_BYTES = 1024 * 1024
const POLICY_VIOLATION_CLOSE_CODE = 1008
const TEMPORARY_OVERLOAD_CLOSE_CODE = 1013
const RATE_LIMIT_CLOSE_REASON = 'MemeDrop message rate exceeded'
const DISCORD_AUTH_REQUIRED_CLOSE_CODE = 4001
const DISCORD_AUTH_REQUIRED_CLOSE_REASON = 'Discord authentication required'
const AUTH_EXPIRATION_TIMER_SLICE_MS = 24 * 60 * 60 * 1000

const getSingleHeaderValue = (value: string | string[] | undefined): string =>
  typeof value === 'string' ? value : ''

const getBearerToken = (authorizationHeader: string): string | null => {
  const match = /^Bearer ([A-Za-z0-9._-]+)$/i.exec(authorizationHeader)
  return match?.[1] ?? null
}

const sendJson = (socket: WebSocket, payload: unknown) => {
  if (socket.readyState === WebSocket.OPEN) {
    if (socket.bufferedAmount > MAX_SOCKET_BUFFERED_BYTES) {
      console.warn('Client MemeDrop déconnecté: file de sortie WebSocket saturée.')
      socket.close(TEMPORARY_OVERLOAD_CLOSE_CODE, 'MemeDrop client too slow')
      return
    }

    socket.send(JSON.stringify(payload), (error) => {
      if (error && socket.readyState !== WebSocket.CLOSED) {
        console.warn(`Envoi WebSocket MemeDrop impossible: ${error.message}`)
        socket.terminate()
      }
    })
  }
}

export const createMemeDropWebSocketServer = ({
  server,
  serverKey,
  latestAppVersion,
  identityTokens,
}: MemeDropWebSocketServerOptions) => {
  const clients = new Map<WebSocket, MemeDropClient>()
  const socketAlive = new WeakMap<WebSocket, boolean>()
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: MAX_CLIENT_MESSAGE_BYTES,
  })
  wss.on('error', (error) => {
    console.error('Erreur serveur WebSocket MemeDrop:', error)
  })

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
    socket.on('error', (error) => {
      console.warn(`Erreur WebSocket MemeDrop: ${error.message}`)
    })

    const appVersionHeader = getSingleHeaderValue(request.headers['x-memedrop-app-version'])
    const appVersion = appVersionHeader.length <= 100 ? appVersionHeader.trim() : ''

    if (wss.clients.size > MAX_WEBSOCKET_CLIENTS) {
      console.warn('Client MemeDrop refusé: capacité WebSocket atteinte.')
      socket.close(TEMPORARY_OVERLOAD_CLOSE_CODE, 'MemeDrop server capacity reached')
      return
    }

    if (!isAuthorizedRequest(request, serverKey)) {
      console.warn('Client MemeDrop refusé: clé invalide.')
      socket.close(1008, 'Invalid MemeDrop key')
      return
    }

    const authorizationHeader = getSingleHeaderValue(request.headers.authorization)
    const authToken = getBearerToken(authorizationHeader)
    const verification = authToken ? identityTokens.verify(authToken) : null

    if (!verification?.ok) {
      const reason = !authorizationHeader
        ? 'missing'
        : !authToken
          ? 'invalid'
          : (verification?.reason ?? 'invalid')
      console.warn(`Client MemeDrop refusé: authentification Discord ${reason}.`)
      socket.close(DISCORD_AUTH_REQUIRED_CLOSE_CODE, DISCORD_AUTH_REQUIRED_CLOSE_REASON)
      return
    }

    const identityConnectionCount = [...clients.values()].filter(
      (client) => client.userId === verification.claims.sub,
    ).length
    if (identityConnectionCount >= MAX_CONNECTIONS_PER_IDENTITY) {
      console.warn('Client MemeDrop refusé: trop de connexions pour cette identité.')
      socket.close(TEMPORARY_OVERLOAD_CLOSE_CODE, 'Too many MemeDrop connections')
      return
    }

    const messageBucket = createTokenBucket({
      capacity: MAX_SOCKET_MESSAGES_PER_BURST,
      refillPerSecond: SOCKET_MESSAGES_REFILL_PER_SECOND,
    })

    let authExpirationTimer: NodeJS.Timeout | null = null
    const scheduleAuthExpiration = () => {
      authExpirationTimer = null
      const remainingMs = verification.claims.exp * 1000 - Date.now()

      if (remainingMs <= 0) {
        if (socket.readyState === WebSocket.OPEN) {
          console.warn('Client MemeDrop déconnecté: session Discord expirée.')
          socket.close(DISCORD_AUTH_REQUIRED_CLOSE_CODE, DISCORD_AUTH_REQUIRED_CLOSE_REASON)
        }
        return
      }

      authExpirationTimer = setTimeout(
        scheduleAuthExpiration,
        Math.min(remainingMs, AUTH_EXPIRATION_TIMER_SLICE_MS),
      )
      authExpirationTimer.unref()
    }

    clients.set(socket, {
      userId: verification.claims.sub,
      userName: verification.claims.name,
      userAvatarUrl: verification.claims.avatarUrl ?? '',
      appVersion,
      dropsEnabled: true,
    })
    socketAlive.set(socket, true)
    scheduleAuthExpiration()
    console.log(`Client MemeDrop connecté (${getClientLogSummary()}).`)
    sendJson(socket, { type: 'hello' })
    broadcastConnectedUsers()
    dropScheduler.scheduleDrops()

    socket.on('message', (data, isBinary) => {
      if (isBinary || !messageBucket.consume()) {
        console.warn('Client MemeDrop déconnecté: messages invalides ou trop fréquents.')
        socket.close(POLICY_VIOLATION_CLOSE_CODE, RATE_LIMIT_CLOSE_REASON)
        return
      }

      try {
        const message = parseClientMessage(data.toString())
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
          const dropsEnabled = message.dropsEnabled === true
          if (client && client.dropsEnabled !== dropsEnabled) {
            client.dropsEnabled = dropsEnabled
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
      if (authExpirationTimer) {
        clearTimeout(authExpirationTimer)
        authExpirationTimer = null
      }
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
  heartbeatTimer.unref()

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
