import WebSocket from 'ws'
import type { ConnectedUser, ConnectionStatus, Drop } from '../shared/types'

const SERVER_HEARTBEAT_TIMEOUT_MS = 75000

type MemeDropClientOptions = {
  serverUrl: string | undefined
  accessKey: string | undefined
  userId: string | undefined
  userName: string | undefined
  userAvatarUrl: string | null | undefined
  appVersion: string
  dropsEnabled: boolean
  onDrop: (drop: Drop) => void
  onClearDrop: () => void
  onConnectedUsers: (users: ConnectedUser[], latestAppVersion: string) => void
  onStatus: (status: ConnectionStatus) => void
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

const toWebSocketUrl = (
  serverUrl: string,
  accessKey: string | undefined,
  userId: string | undefined,
  userName: string | undefined,
  userAvatarUrl: string | null | undefined,
  appVersion: string,
) => {
  const normalizedUrl = serverUrl.match(/^https?:\/\//i) ? serverUrl : `https://${serverUrl}`
  const url = new URL(normalizedUrl)

  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws'
  url.search = ''

  if (accessKey) {
    url.searchParams.set('key', accessKey)
  }

  if (userId) {
    url.searchParams.set('userId', userId)
  }

  if (userName) {
    url.searchParams.set('userName', userName)
  }

  if (userAvatarUrl) {
    url.searchParams.set('userAvatarUrl', userAvatarUrl)
  }

  if (appVersion) {
    url.searchParams.set('appVersion', appVersion)
  }

  return url.toString()
}

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
    userId,
    userName,
    userAvatarUrl,
    appVersion,
    dropsEnabled,
    onDrop,
    onClearDrop,
    onConnectedUsers,
    onStatus,
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

  let socket: WebSocket | null = null
  let reconnectTimer: NodeJS.Timeout | null = null
  let heartbeatTimer: NodeJS.Timeout | null = null
  let stopped = false

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

  const connect = () => {
    let wsUrl: string

    try {
      wsUrl = toWebSocketUrl(
        serverUrl.trim(),
        accessKey?.trim(),
        userId?.trim(),
        userName?.trim(),
        userAvatarUrl,
        appVersion,
      )
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

    socket = new WebSocket(wsUrl)

    socket.on('open', () => {
      resetHeartbeatTimer()
      onStatus({
        level: 'info',
        message: 'Serveur MemeDrop : connecté.',
      })
      sendMessage({
        type: 'client-state',
        dropsEnabled,
      })
    })

    socket.on('message', (data) => {
      resetHeartbeatTimer()

      try {
        const message = JSON.parse(data.toString()) as ServerMessage

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

    socket.on('ping', () => {
      resetHeartbeatTimer()
    })

    socket.on('close', () => {
      clearHeartbeatTimer()

      if (stopped) {
        return
      }

      onClearDrop()
      onStatus({
        level: 'error',
        message: 'Serveur MemeDrop : déconnecté, reconnexion...',
      })
      scheduleReconnect()
    })

    socket.on('error', (error) => {
      onStatus({
        level: 'error',
        message: `Serveur MemeDrop : erreur (${error.message}).`,
      })
    })
  }

  connect()

  const sendMessage = (payload: unknown) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload))
    }
  }

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
