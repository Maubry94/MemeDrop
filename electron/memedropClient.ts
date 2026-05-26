import WebSocket from 'ws'
import type { ConnectionStatus, Drop } from '../src/shared/types'

type MemeDropClientOptions = {
  serverUrl: string | undefined
  accessKey: string | undefined
  onDrop: (drop: Drop) => void
  onStatus: (status: ConnectionStatus) => void
}

type ServerMessage =
  | {
      type: 'drop'
      drop: Drop
    }
  | {
      type: 'hello'
    }

const toWebSocketUrl = (serverUrl: string, accessKey: string | undefined) => {
  const normalizedUrl = serverUrl.match(/^https?:\/\//i) ? serverUrl : `https://${serverUrl}`
  const url = new URL(normalizedUrl)

  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws'
  url.search = ''

  if (accessKey) {
    url.searchParams.set('key', accessKey)
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
  const { serverUrl, accessKey, onDrop, onStatus } = options

  if (!serverUrl) {
    onStatus({
      level: 'error',
      message: 'Serveur MemeDrop : URL manquante.',
    })
    return () => undefined
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
      wsUrl = toWebSocketUrl(serverUrl.trim(), accessKey?.trim())
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

        if (message.type === 'drop' && isDrop(message.drop)) {
          console.log(`Drop reçu du serveur MemeDrop : ${message.drop.id}`)
          onDrop(message.drop)
        }
      } catch (error) {
        console.error('Message serveur MemeDrop invalide:', error)
      }
    })

    socket.on('close', () => {
      if (stopped) {
        return
      }

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

  return () => {
    stopped = true
    clearReconnectTimer()
    socket?.close()
    socket = null
  }
}
