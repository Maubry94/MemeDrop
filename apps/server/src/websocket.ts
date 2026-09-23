import WebSocket, { WebSocketServer } from 'ws'
import type { ConnectedUser, Drop, MemeDropServerMessage } from '@memedrop/protocol'
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
const DEFAULT_CLIENT_STATE_TIMEOUT_MS = 15000
const CLIENT_STATE_REQUIRED_CLOSE_REASON = 'MemeDrop client state required'
const REPLACED_CONNECTION_CLOSE_CODE = 4002
const REPLACED_CONNECTION_CLOSE_REASON = 'MemeDrop connection replaced'
const CLIENT_INSTANCE_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

const getSingleHeaderValue = (value: string | string[] | undefined): string =>
  typeof value === 'string' ? value : ''

const getBearerToken = (authorizationHeader: string): string | null => {
  const match = /^Bearer ([A-Za-z0-9._-]+)$/i.exec(authorizationHeader)
  return match?.[1] ?? null
}

const getClientInstanceId = (value: string | string[] | undefined): string => {
  const instanceId = getSingleHeaderValue(value).trim()
  return CLIENT_INSTANCE_ID_PATTERN.test(instanceId) ? instanceId : ''
}

const sendJson = (socket: WebSocket, payload: MemeDropServerMessage) => {
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
  getLatestAppVersion,
  identityTokens,
  clientStateTimeoutMs = DEFAULT_CLIENT_STATE_TIMEOUT_MS,
  completionGraceMs,
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

  const getReadyClientEntries = () =>
    [...clients.entries()]
      .filter(([socket, client]) => (
        socket.readyState === WebSocket.OPEN && client.ready
      ))

  const getEligibleClients = () =>
    getReadyClientEntries()
      .filter(([, client]) => client.dropsEnabled)
      .map(([socket]) => socket)

  const getClientLogSummary = () => {
    const readyClients = getReadyClientEntries()
    const users = new Set(readyClients.map(([, client]) => client.userId))
    return `${clients.size} socket(s), ${readyClients.length} connexion(s) prête(s), ${users.size} utilisateur(s), ${getEligibleClients().length} réception(s) active(s)`
  }

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

  const isVersionOutdated = (appVersion: string, latestAppVersion: string) =>
    Boolean(appVersion) && compareAppVersions(appVersion, latestAppVersion) < 0

  const buildConnectedUsers = (latestAppVersion: string): ConnectedUser[] => {
    const users = new Map<string, ConnectedUser>()

    for (const [, client] of getReadyClientEntries()) {

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
        updateAvailable: appVersions.some((version) => (
          isVersionOutdated(version, latestAppVersion)
        )),
      })
    }

    return [...users.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  const getConnectedUsers = (): ConnectedUser[] => (
    buildConnectedUsers(getLatestAppVersion())
  )

  let lastBroadcastAppVersion = getLatestAppVersion()
  const broadcastConnectedUsers = (
    latestAppVersion = getLatestAppVersion(),
  ) => {
    const connectedUsers = buildConnectedUsers(latestAppVersion)

    for (const socket of clients.keys()) {
      sendJson(socket, {
        type: 'connected-users',
        users: connectedUsers,
        latestAppVersion,
      })
    }

    lastBroadcastAppVersion = latestAppVersion
  }

  const getClientsByUserId = (userId: string) =>
    getReadyClientEntries()
      .filter(([, client]) => client.userId === userId && client.dropsEnabled)
      .map(([socket]) => socket)

  const dropScheduler = createDropScheduler<WebSocket>({
    completionGraceMs,
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
    getTargetLogLabel: (socket) => {
      const client = clients.get(socket)
      if (!client) {
        return 'une connexion inconnue'
      }

      return `user=${client.userId}, instance=${client.clientInstanceId || 'legacy'}, version=${JSON.stringify(client.appVersion || 'unknown')}`
    },
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
    const clientInstanceId = getClientInstanceId(
      request.headers['x-memedrop-client-instance-id'],
    )

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

    const identityConnections = [...clients.values()].filter(
      (client) => client.userId === verification.claims.sub,
    )
    const replacesExistingInstance = Boolean(
      clientInstanceId && identityConnections.some(
        (client) => client.clientInstanceId === clientInstanceId,
      ),
    )
    const replacementAlreadyPending = Boolean(
      clientInstanceId && identityConnections.some(
        (client) => client.clientInstanceId === clientInstanceId && !client.ready,
      ),
    )
    const canUseTemporaryReplacementSlot =
      replacesExistingInstance &&
      !replacementAlreadyPending &&
      identityConnections.length === MAX_CONNECTIONS_PER_IDENTITY
    if (
      identityConnections.length >= MAX_CONNECTIONS_PER_IDENTITY &&
      !canUseTemporaryReplacementSlot
    ) {
      console.warn('Client MemeDrop refusé: trop de connexions pour cette identité.')
      socket.close(TEMPORARY_OVERLOAD_CLOSE_CODE, 'Too many MemeDrop connections')
      return
    }

    const messageBucket = createTokenBucket({
      capacity: MAX_SOCKET_MESSAGES_PER_BURST,
      refillPerSecond: SOCKET_MESSAGES_REFILL_PER_SECOND,
    })

    let authExpirationTimer: NodeJS.Timeout | null = null
    let clientStateTimer: NodeJS.Timeout | null = null
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
      clientInstanceId,
      ready: false,
      dropsEnabled: false,
    })
    socketAlive.set(socket, true)
    scheduleAuthExpiration()
    clientStateTimer = setTimeout(() => {
      clientStateTimer = null
      const client = clients.get(socket)
      if (client && !client.ready && socket.readyState === WebSocket.OPEN) {
        console.warn('Client MemeDrop déconnecté: état initial non reçu.')
        socket.close(POLICY_VIOLATION_CLOSE_CODE, CLIENT_STATE_REQUIRED_CLOSE_REASON)
      }
    }, clientStateTimeoutMs)
    clientStateTimer.unref()
    console.log(`Client MemeDrop connecté (${getClientLogSummary()}).`)
    sendJson(socket, { type: 'hello', capabilities: { dropCompletionReason: true } })
    broadcastConnectedUsers()

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
          dropScheduler.completeDropForTarget(socket, message.dropId, message.reason)
        }
        if (message.type === 'drop-stop') {
          stopDropForEveryone(socket, message.dropId)
        }
        if (message.type === 'client-state') {
          const client = clients.get(socket)
          const dropsEnabled = message.dropsEnabled === true
          if (!client) {
            return
          }

          const becameReady = !client.ready
          const stateChanged = client.dropsEnabled !== dropsEnabled
          client.ready = true
          client.dropsEnabled = dropsEnabled

          if (becameReady && clientStateTimer) {
            clearTimeout(clientStateTimer)
            clientStateTimer = null
          }

          if (becameReady && client.clientInstanceId) {
            for (const [otherSocket, otherClient] of clients.entries()) {
              if (
                otherSocket === socket ||
                otherClient.userId !== client.userId ||
                otherClient.clientInstanceId !== client.clientInstanceId
              ) {
                continue
              }

              otherClient.ready = false
              otherClient.dropsEnabled = false
              if (dropsEnabled) {
                dropScheduler.replaceTarget(otherSocket, socket)
              } else {
                dropScheduler.removeTarget(otherSocket)
              }
              console.warn('Ancienne connexion MemeDrop remplacée après reconnexion.')
              otherSocket.close(
                REPLACED_CONNECTION_CLOSE_CODE,
                REPLACED_CONNECTION_CLOSE_REASON,
              )
            }
          }

          if (becameReady || stateChanged) {
            broadcastConnectedUsers()
          }
          if (!dropsEnabled) {
            dropScheduler.removeTarget(socket)
            // The socket stays connected while reception is paused. Clear the
            // desktop snapshot as well as the scheduler state so re-enabling
            // drops cannot make the previous media reappear locally.
            sendJson(socket, { type: 'clear-drop' })
          }
          dropScheduler.scheduleDrops()
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
      if (clientStateTimer) {
        clearTimeout(clientStateTimer)
        clientStateTimer = null
      }
      clients.delete(socket)
      socketAlive.delete(socket)
      dropScheduler.removeTarget(socket)

      console.log(`Client MemeDrop déconnecté (${getClientLogSummary()}).`)
      broadcastConnectedUsers()
    })
  })

  const heartbeatTimer = setInterval(() => {
    const latestAppVersion = getLatestAppVersion()
    if (latestAppVersion !== lastBroadcastAppVersion) {
      broadcastConnectedUsers(latestAppVersion)
    }

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
