import WebSocket from 'ws'
import type { ConnectedUser, ConnectionStatus, Drop } from '../../shared/types'
import { toMemeDropServerUrl } from './serverUrl'

const SERVER_HEARTBEAT_TIMEOUT_MS = 75000

type MemeDropClientOptions = {
  serverUrl: string | undefined
  accessKey: string | undefined
  authToken: string | undefined
  appVersion: string
  dropsEnabled: boolean
  onDrop: (drop: Drop) => void
  onClearDrop: () => void
  onConnectedUsers: (users: ConnectedUser[], latestAppVersion: string) => void
  onStatus: (status: ConnectionStatus) => void
  onAuthenticationRejected: () => void
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
  completeDrop: (dropId: string) => void
  stopDrop: (dropId: string) => void
  updateDropsEnabled: (enabled: boolean) => void
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

export function startMemeDropClient(options: MemeDropClientOptions) {
  const {
    serverUrl,
    accessKey,
    authToken,
    appVersion,
    dropsEnabled,
    onDrop,
    onClearDrop,
    onConnectedUsers,
    onStatus,
    onAuthenticationRejected,
  } = options

  if (!serverUrl) {
    onStatus({
      level: 'error',
      message: 'Serveur MemeDrop : URL manquante.',
    })
    return {
      completeDrop: () => undefined,
      stopDrop: () => undefined,
      updateDropsEnabled: () => undefined,
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
      completeDrop: () => undefined,
      stopDrop: () => undefined,
      updateDropsEnabled: () => undefined,
      stop: () => undefined,
    }
  }

  let socket: WebSocket | null = null
  let reconnectTimer: NodeJS.Timeout | null = null
  let heartbeatTimer: NodeJS.Timeout | null = null
  let stopped = false
  let serverReady = false
  let currentDropsEnabled = dropsEnabled

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const clearHeartbeatTimer = () => {
    if (heartbeatTimer) {
      clearTimeout(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  const resetHeartbeatTimer = () => {
    clearHeartbeatTimer()

    if (stopped) {
      return
    }

    heartbeatTimer = setTimeout(() => {
      onStatus({
        level: 'error',
        message: 'Serveur MemeDrop : connexion inactive, reconnexion...',
      })
      socket?.terminate()
      scheduleReconnect()
    }, SERVER_HEARTBEAT_TIMEOUT_MS)
  }

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) {
      return
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, 3000)
  }

  const sendMessage = (payload: unknown) => {
    if (serverReady && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload))
    }
  }

  const connect = () => {
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
      nextSocket = new WebSocket(wsUrl, {
        headers: getWebSocketHeaders(accessKey, normalizedAuthToken, appVersion),
        followRedirects: false,
      })
    } catch {
      onStatus({
        level: 'error',
        message: 'Serveur MemeDrop : configuration de connexion invalide.',
      })
      return
    }

    socket = nextSocket

    nextSocket.on('open', () => {
      if (socket !== nextSocket || stopped) {
        return
      }
      resetHeartbeatTimer()
      onStatus({
        level: 'info',
        message: 'Serveur MemeDrop : authentification en cours...',
      })
    })

    nextSocket.on('message', (data) => {
      if (socket !== nextSocket || stopped) {
        return
      }
      resetHeartbeatTimer()

      try {
        const message = JSON.parse(data.toString()) as ServerMessage

        if (message.type === 'hello') {
          if (!serverReady) {
            serverReady = true
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

        if (!serverReady) {
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
      if (socket !== nextSocket || stopped) {
        return
      }
      resetHeartbeatTimer()
    })

    nextSocket.on('close', (code) => {
      if (socket !== nextSocket) {
        return
      }
      clearHeartbeatTimer()
      serverReady = false
      socket = null

      if (stopped) {
        return
      }

      onClearDrop()

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

      onStatus({
        level: 'error',
        message: 'Serveur MemeDrop : déconnecté, reconnexion...',
      })
      scheduleReconnect()
    })

    nextSocket.on('error', (error) => {
      if (socket !== nextSocket || stopped) {
        return
      }
      onStatus({
        level: 'error',
        message: `Serveur MemeDrop : erreur (${error.message}).`,
      })
    })
  }

  connect()

  return {
    completeDrop: (dropId: string) => {
      sendMessage({
        type: 'drop-completed',
        dropId,
      })
    },
    stopDrop: (dropId: string) => {
      sendMessage({
        type: 'drop-stop',
        dropId,
      })
    },
    updateDropsEnabled: (enabled: boolean) => {
      currentDropsEnabled = enabled
      sendMessage({
        type: 'client-state',
        dropsEnabled: enabled,
      })
    },
    stop: () => {
      stopped = true
      clearReconnectTimer()
      clearHeartbeatTimer()
      socket?.close()
      socket = null
    },
  }
}
