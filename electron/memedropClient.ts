import WebSocket from 'ws'
import type { ConnectedUser, ConnectionStatus, Drop } from '../src/shared/types'

type MemeDropClientOptions = {
  serverUrl: string | undefined
  accessKey: string | undefined
  userId: string | undefined
  userName: string | undefined
  userAvatarUrl: string | null | undefined
  dropsEnabled: boolean
  onDrop: (drop: Drop) => void
  onClearDrop: () => void
  onConnectedUsers: (users: ConnectedUser[]) => void
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
  let stopped = false

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
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
          onConnectedUsers(message.users)
        }
      } catch (error) {
        console.error('Message serveur MemeDrop invalide:', error)
      }
    })

    socket.on('close', () => {
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
      socket?.close()
      socket = null
    },
  }
}
