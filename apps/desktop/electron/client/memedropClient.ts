import WebSocket from 'ws'
import type {
  ConnectedUser,
  Drop,
  MemeDropClientMessage,
  MemeDropServerMessage,
} from '@memedrop/protocol'
import type { ConnectionStatus } from '../../shared/types'
import { toMemeDropServerUrl } from './serverUrl.ts'

const SERVER_HEARTBEAT_TIMEOUT_MS = 75000
const SERVER_HANDSHAKE_TIMEOUT_MS = 15000
const RECONNECT_DELAY_MS = 3000
const DISCORD_AUTH_REQUIRED_CLOSE_CODE = 4001
const POLICY_VIOLATION_CLOSE_CODE = 1008
const INVALID_ACCESS_KEY_CLOSE_REASON = 'Invalid MemeDrop key'

type MemeDropClientOptions = {
  serverUrl: string | undefined
  accessKey: string | undefined
  authToken: string | undefined
  appVersion: string
  dropsEnabled: boolean
  onDrop: (drop: Drop) => void
  onClearDrop: () => void
  onConnectedUsers: (users: ConnectedUser[], latestAppVersion: string) => void
  onDisconnected: () => void
  onStatus: (status: ConnectionStatus) => void
  onAuthenticationRejected: () => void
}

export type MemeDropClientRuntime = {
  createSocket: (url: string, options: WebSocket.ClientOptions) => WebSocket
  setTimer: (callback: () => void, delayMs: number) => NodeJS.Timeout
  clearTimer: (timer: NodeJS.Timeout) => void
}

type ActiveConnection = {
  generation: number
  socket: WebSocket
  serverReady: boolean
  heartbeatTimer: NodeJS.Timeout | null
}

const defaultRuntime: MemeDropClientRuntime = {
  createSocket: (url, options) => new WebSocket(url, options),
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (timer) => clearTimeout(timer),
}

export type MemeDropClientController = {
  completeDrop: (dropId: string) => boolean
  stopDrop: (dropId: string) => boolean
  updateDropsEnabled: (enabled: boolean) => boolean
  stop: () => void
}

const toWebSocketUrl = (serverUrl: string) => {
  const url = toMemeDropServerUrl(serverUrl)

  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws'
  url.search = ''
  url.hash = ''

  return url.toString()
}

const getWebSocketHeaders = (
  accessKey: string | undefined,
  authToken: string,
  appVersion: string,
): Record<string, string> => ({
  authorization: `Bearer ${authToken}`,
  ...(accessKey?.trim() ? { 'x-memedrop-key': accessKey.trim() } : {}),
  ...(appVersion.trim() ? { 'x-memedrop-app-version': appVersion.trim() } : {}),
})

const isDrop = (value: unknown): value is Drop => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const drop = value as Partial<Drop>
  return typeof drop.id === 'string' && typeof drop.url === 'string'
}

export function startMemeDropClient(
  options: MemeDropClientOptions,
  runtime: MemeDropClientRuntime = defaultRuntime,
) {
  const {
    serverUrl,
    accessKey,
    authToken,
    appVersion,
    dropsEnabled,
    onDrop,
    onClearDrop,
    onConnectedUsers,
    onDisconnected,
    onStatus,
    onAuthenticationRejected,
  } = options

  if (!serverUrl) {
    onStatus({
      state: 'configuration-required',
      reason: 'server-not-configured',
      level: 'info',
      message: 'Serveur MemeDrop : URL manquante.',
    })
    return {
      completeDrop: () => false,
      stopDrop: () => false,
      updateDropsEnabled: () => false,
      stop: () => undefined,
    }
  }

  const normalizedServerUrl = serverUrl.trim()
  const normalizedAuthToken = authToken?.trim() ?? ''

  if (!normalizedAuthToken) {
    onStatus({
      state: 'authentication-required',
      reason: 'discord-required',
      level: 'info',
      message: 'Serveur MemeDrop : connexion Discord requise.',
    })
    return {
      completeDrop: () => false,
      stopDrop: () => false,
      updateDropsEnabled: () => false,
      stop: () => undefined,
    }
  }

  let activeConnection: ActiveConnection | null = null
  let nextGeneration = 0
  let reconnectTimer: NodeJS.Timeout | null = null
  let stopped = false
  let isReconnectAttempt = false
  let currentDropsEnabled = dropsEnabled

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      runtime.clearTimer(reconnectTimer)
      reconnectTimer = null
    }
  }

  const isActiveConnection = (connection: ActiveConnection) =>
    !stopped &&
    activeConnection?.generation === connection.generation &&
    activeConnection.socket === connection.socket

  const clearHeartbeatTimer = (connection: ActiveConnection) => {
    if (connection.heartbeatTimer) {
      runtime.clearTimer(connection.heartbeatTimer)
      connection.heartbeatTimer = null
    }
  }

  const retireConnection = (connection: ActiveConnection) => {
    if (
      activeConnection?.generation !== connection.generation ||
      activeConnection.socket !== connection.socket
    ) {
      return false
    }

    clearHeartbeatTimer(connection)
    connection.serverReady = false
    activeConnection = null
    return true
  }

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer || activeConnection) {
      return
    }

    isReconnectAttempt = true
    const timer = runtime.setTimer(() => {
      if (reconnectTimer !== timer) {
        return
      }

      reconnectTimer = null
      if (stopped || activeConnection) {
        return
      }
      connect()
    }, RECONNECT_DELAY_MS)
    reconnectTimer = timer
  }

  const terminateAndReconnect = (connection: ActiveConnection) => {
    if (!retireConnection(connection)) {
      return
    }

    onDisconnected()
    try {
      connection.socket.terminate()
    } catch {
      // The socket may already have been closed by the underlying transport.
    }
    scheduleReconnect()
  }

  const resetHeartbeatTimer = (connection: ActiveConnection) => {
    clearHeartbeatTimer(connection)

    if (!isActiveConnection(connection)) {
      return
    }

    connection.heartbeatTimer = runtime.setTimer(() => {
      if (!isActiveConnection(connection)) {
        return
      }

      onStatus({
        state: 'reconnecting',
        reason: 'connection-inactive',
        level: 'info',
        message: 'Serveur MemeDrop : connexion inactive, reconnexion...',
      })
      terminateAndReconnect(connection)
    }, SERVER_HEARTBEAT_TIMEOUT_MS)
  }

  const sendMessage = (payload: MemeDropClientMessage): boolean => {
    const connection = activeConnection
    if (
      !connection ||
      !isActiveConnection(connection) ||
      !connection.serverReady ||
      connection.socket.readyState !== WebSocket.OPEN
    ) {
      return false
    }

    try {
      connection.socket.send(JSON.stringify(payload), (error) => {
        if (!error || !isActiveConnection(connection)) {
          return
        }

        console.error("Envoi vers le serveur MemeDrop interrompu :", error)
        onStatus({
          state: 'reconnecting',
          reason: 'transport-error',
          level: 'info',
          message: "Serveur MemeDrop : erreur d'envoi, reconnexion...",
        })
        terminateAndReconnect(connection)
      })
      return true
    } catch (error) {
      if (isActiveConnection(connection)) {
        console.error("Envoi vers le serveur MemeDrop impossible :", error)
        onStatus({
          state: 'reconnecting',
          reason: 'transport-error',
          level: 'info',
          message: "Serveur MemeDrop : erreur d'envoi, reconnexion...",
        })
        terminateAndReconnect(connection)
      }

      return false
    }
  }

  function connect() {
    if (stopped || activeConnection) {
      return
    }

    clearReconnectTimer()
    let wsUrl: string

    try {
      wsUrl = toWebSocketUrl(normalizedServerUrl)
    } catch {
      onStatus({
        state: 'error',
        reason: 'invalid-server-url',
        level: 'error',
        message: 'Serveur MemeDrop : URL invalide.',
      })
      return
    }

    onStatus(
      isReconnectAttempt
        ? {
            state: 'reconnecting',
            level: 'info',
            message: 'Serveur MemeDrop : reconnexion en cours...',
          }
        : {
            state: 'connecting',
            level: 'info',
            message: 'Serveur MemeDrop : connexion en cours...',
          },
    )

    let nextSocket: WebSocket

    try {
      nextSocket = runtime.createSocket(wsUrl, {
        headers: getWebSocketHeaders(accessKey, normalizedAuthToken, appVersion),
        followRedirects: false,
        handshakeTimeout: SERVER_HANDSHAKE_TIMEOUT_MS,
      })
    } catch {
      onStatus({
        state: 'error',
        reason: 'invalid-configuration',
        level: 'error',
        message: 'Serveur MemeDrop : configuration de connexion invalide.',
      })
      return
    }

    const connection: ActiveConnection = {
      generation: ++nextGeneration,
      socket: nextSocket,
      serverReady: false,
      heartbeatTimer: null,
    }
    activeConnection = connection

    nextSocket.on('open', () => {
      if (!isActiveConnection(connection)) {
        return
      }
      resetHeartbeatTimer(connection)
      onStatus(
        isReconnectAttempt
          ? {
              state: 'reconnecting',
              level: 'info',
              message: 'Serveur MemeDrop : reconnexion en cours...',
            }
          : {
              state: 'authenticating',
              level: 'info',
              message: 'Serveur MemeDrop : authentification en cours...',
            },
      )
    })

    nextSocket.on('message', (data) => {
      if (!isActiveConnection(connection)) {
        return
      }
      resetHeartbeatTimer(connection)

      try {
        const message = JSON.parse(data.toString()) as MemeDropServerMessage

        if (message.type === 'hello') {
          if (!connection.serverReady) {
            connection.serverReady = true
            isReconnectAttempt = false
            onStatus({
              state: 'connected',
              level: 'info',
              message: 'Serveur MemeDrop : connecté.',
            })
            sendMessage({
              type: 'client-state',
              dropsEnabled: currentDropsEnabled,
            })
          }
          return
        }

        if (!connection.serverReady) {
          return
        }

        if ((message.type === 'active-drop' || message.type === 'drop') && isDrop(message.drop)) {
          console.log(`Drop reçu du serveur MemeDrop : ${message.drop.id}`)
          onDrop(message.drop)
        }

        if (message.type === 'clear-drop') {
          onClearDrop()
        }

        if (message.type === 'connected-users') {
          onConnectedUsers(message.users, message.latestAppVersion ?? appVersion)
        }
      } catch (error) {
        console.error('Message serveur MemeDrop invalide:', error)
      }
    })

    nextSocket.on('ping', () => {
      if (!isActiveConnection(connection)) {
        return
      }
      resetHeartbeatTimer(connection)
    })

    nextSocket.on('close', (code, reason) => {
      if (!retireConnection(connection)) {
        return
      }

      if (stopped) {
        return
      }

      onDisconnected()

      if (code === DISCORD_AUTH_REQUIRED_CLOSE_CODE) {
        stopped = true
        clearReconnectTimer()
        onStatus({
          state: 'refused',
          reason: 'session-expired',
          level: 'error',
          message: 'Serveur MemeDrop : session Discord expirée, reconnecte-toi.',
        })
        onAuthenticationRejected()
        return
      }

      if (code === POLICY_VIOLATION_CLOSE_CODE) {
        stopped = true
        clearReconnectTimer()
        const closeReason = reason.toString()
        onStatus(
          closeReason === INVALID_ACCESS_KEY_CLOSE_REASON
            ? {
                state: 'refused',
                reason: 'access-denied',
                level: 'error',
                message: 'Serveur MemeDrop : connexion refusée. Vérifie la clé du serveur.',
              }
            : {
                state: 'refused',
                reason: 'server-policy',
                level: 'error',
                message: 'Serveur MemeDrop : connexion interrompue par le serveur.',
              },
        )
        return
      }

      onStatus({
        state: 'reconnecting',
        reason: 'transport-error',
        level: 'info',
        message: 'Serveur MemeDrop : déconnecté, reconnexion...',
      })
      scheduleReconnect()
    })

    nextSocket.on('error', (error) => {
      if (!isActiveConnection(connection)) {
        return
      }
      console.error('Connexion au serveur MemeDrop interrompue :', error)
      onStatus({
        state: 'reconnecting',
        reason: 'transport-error',
        level: 'info',
        message: 'Serveur MemeDrop : connexion interrompue, reconnexion...',
      })
      terminateAndReconnect(connection)
    })
  }

  connect()

  return {
    completeDrop: (dropId: string) =>
      sendMessage({
        type: 'drop-completed',
        dropId,
      }),
    stopDrop: (dropId: string) =>
      sendMessage({
        type: 'drop-stop',
        dropId,
      }),
    updateDropsEnabled: (enabled: boolean) => {
      currentDropsEnabled = enabled
      return sendMessage({
        type: 'client-state',
        dropsEnabled: enabled,
      })
    },
    stop: () => {
      stopped = true
      clearReconnectTimer()
      const connection = activeConnection
      if (!connection || !retireConnection(connection)) {
        return
      }

      try {
        connection.socket.close(1000, 'MemeDrop client stopped')
      } catch {
        try {
          connection.socket.terminate()
        } catch {
          // The transport is already gone.
        }
      }
    },
  }
}
