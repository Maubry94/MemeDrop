import type http from 'node:http'
import type WebSocket from 'ws'
import type { ConnectedUser, Drop } from '../shared/types.js'

export type DiscordStatus = 'starting' | 'connected' | 'error'

export type MemeDropClient = {
  userId: string
  userName: string
  userAvatarUrl: string
  appVersion: string
  dropsEnabled: boolean
}

export type DropScope = 'global' | 'targeted'

export type DropJob = {
  drop: Drop
  targets: Set<WebSocket>
  done: Set<WebSocket>
  scope: DropScope
  targetUserId: string | null
  timer: ReturnType<typeof setTimeout> | null
}

export type BroadcastDrop = (drop: Drop) => number

export type GetConnectedUsers = () => ConnectedUser[]

export type StopDropByOwner = (
  dropId: string,
  ownerId: string,
  options?: {
    sendClear?: boolean
  },
) => boolean

export type MemeDropWebSocketServerOptions = {
  server: http.Server
  serverKey: string
  latestAppVersion: string
}

export type MemeDropWebSocketMessage =
  | {
      type: 'drop-completed'
      dropId: string
    }
  | {
      type: 'drop-stop'
      dropId: string
    }
  | {
      type: 'client-state'
      dropsEnabled?: boolean
    }

export type DiscordBotOptions = {
  token?: string
  guildId?: string
  broadcastDrop: BroadcastDrop
  getConnectedUsers: GetConnectedUsers
  stopDropByOwner: StopDropByOwner
  onStatusChange: (status: DiscordStatus) => void
}
