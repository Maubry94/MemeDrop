import type http from 'node:http'
import type { ConnectedUser, Drop } from '../shared/types.js'

export type DiscordStatus = 'starting' | 'connected' | 'error'

export type MemeDropClient = {
  userId: string
  userName: string
  userAvatarUrl: string
  appVersion: string
  dropsEnabled: boolean
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
  latestAppVersion: string
  allowedRoleIds: string[]
  allowedChannelIds: string[]
  dropCooldownSeconds: number
  broadcastDrop: BroadcastDrop
  getConnectedUsers: GetConnectedUsers
  stopDropByOwner: StopDropByOwner
  onStatusChange: (status: DiscordStatus) => void
}
