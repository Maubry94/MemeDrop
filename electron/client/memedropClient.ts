import WebSocket from 'ws'
import type { ConnectedUser, ConnectionStatus, Drop } from '../../shared/types'
import { toMemeDropServerUrl } from './serverUrl.ts'

const SERVER_HEARTBEAT_TIMEOUT_MS = 75000
const SERVER_HANDSHAKE_TIMEOUT_MS = 15000
const RECONNECT_DELAY_MS = 3000

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

type ServerMessage =
  | {
      type: 'active-drop' | 'drop'
      drop: Drop
    }
  | {
      type: 'hello'
    }
  | {
      type: 'clear-drop'
    }
  | {
      type: 'connected-users'
      users: ConnectedUser[]
      latestAppVersion?: string
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
      level: 'error',
      message: 'Serveur MemeDrop : URL manquante.',
    })
    return {
      completeDrop: () => false,
      stopDrop: () => false,
      updateDropsEnabled: () => false,
      stop: () => undefined,
    }
  }

  const normalizedAuthToken = authToken?.trim() ?? ''

  if (!normalizedAuthToken) {
    onStatus({
      level: 'error',
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

  let connect: () => void

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer || activeConnection) {
      return
    }

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
        level: 'error',
        message: 'Serveur MemeDrop : connexion inactive, reconnexion...',
      })
      terminateAndReconnect(connection)
    }, SERVER_HEARTBEAT_TIMEOUT_MS)
  }

  const sendMessage = (payload: unknown): boolean => {
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

        onStatus({
          level: 'error',
          message: `Serveur MemeDrop : erreur d'envoi (${error.message}).`,
        })
        terminateAndReconnect(connection)
      })
      return true
    } catch (error) {
      if (isActiveConnection(connection)) {
        onStatus({
          level: 'error',
          message: `Serveur MemeDrop : erreur d'envoi (${error instanceof Error ? error.message : 'inconnue'}).`,
        })
        terminateAndReconnect(connection)
      }

      return false
    }
  }

  connect = () => {
    if (stopped || activeConnection) {
      return
    }

    clearReconnectTimer()
    let wsUrl: string

    try {
      wsUrl = toWebSocketUrl(serverUrl.trim())
    } catch {
      onStatus({
        level: 'error',
        message: 'Serveur MemeDrop : URL invalide.',
      })
      return
    }

    onStatus({
      level: 'info',
      message: 'Serveur MemeDrop : connexion en cours...',
    })

    let nextSocket: WebSocket

    try {
      nextSocket = runtime.createSocket(wsUrl, {
        headers: getWebSocketHeaders(accessKey, normalizedAuthToken, appVersion),
        followRedirects: false,
        handshakeTimeout: SERVER_HANDSHAKE_TIMEOUT_MS,
      })
    } catch {
      onStatus({
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
      onStatus({
        level: 'info',
        message: 'Serveur MemeDrop : authentification en cours...',
      })
    })

    nextSocket.on('message', (data) => {
      if (!isActiveConnection(connection)) {
        return
      }
      resetHeartbeatTimer(connection)

      try {
        const message = JSON.parse(data.toString()) as ServerMessage

        if (message.type === 'hello') {
          if (!connection.serverReady) {
            connection.serverReady = true
            onStatus({
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

    nextSocket.on('close', (code) => {
      if (!retireConnection(connection)) {
        return
      }

      if (stopped) {
        return
      }

      onDisconnected()

      if (code === 4001) {
        stopped = true
        clearReconnectTimer()
        onStatus({
          level: 'error',
          message: 'Serveur MemeDrop : session Discord expirée, reconnecte-toi.',
        })
        onAuthenticationRejected()
        return
      }

      if (code === 1008) {
        stopped = true
        clearReconnectTimer()
        onStatus({
          level: 'error',
          message: 'Serveur MemeDrop : connexion refusée. Vérifie la clé du serveur.',
        })
        return
      }

      onStatus({
        level: 'error',
        message: 'Serveur MemeDrop : déconnecté, reconnexion...',
      })
      scheduleReconnect()
    })

    nextSocket.on('error', (error) => {
      if (!isActiveConnection(connection)) {
        return
      }
      onStatus({
        level: 'error',
        message: `Serveur MemeDrop : erreur (${error.message}).`,
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
