import WebSocket from 'ws'
import type { ConnectionStatus, Drop } from '../src/shared/types'

type MemeDropClientOptions = {
  serverUrl: string | undefined
  accessKey: string | undefined
  userId: string | undefined
  onDrop: (drop: Drop) => void
  onClearDrop: () => void
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

export type MemeDropClientController = {
  completeDrop: (dropId: string) => void
  stopDrop: (dropId: string) => void
  stop: () => void
}

const toWebSocketUrl = (
  serverUrl: string,
  accessKey: string | undefined,
  userId: string | undefined,
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
  const { serverUrl, accessKey, userId, onDrop, onClearDrop, onStatus } = options

  if (!serverUrl) {
    onStatus({
      level: 'error',
      message: 'Serveur MemeDrop : URL manquante.',
    })
    return {
      completeDrop: () => undefined,
      stopDrop: () => undefined,
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
      wsUrl = toWebSocketUrl(serverUrl.trim(), accessKey?.trim(), userId?.trim())
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
    stop: () => {
      stopped = true
      clearReconnectTimer()
      socket?.close()
      socket = null
    },
  }
}
