export type Drop = {
  id: string
  url: string
  contentType: string | null
  fileName: string | null
  youtubeVideoId?: string | null
  tiktokVideoId?: string | null
  caption: string | null
  authorId: string | null
  ownerId?: string | null
  isAnonymous?: boolean
  targetUserId?: string | null
  targetUserName?: string | null
  author: string | null
  authorAvatarUrl: string | null
  createdAt: string
}

export type DiscordUser = {
  id: string
  username: string
  avatarUrl: string | null
}

export type ConnectedUser = {
  id: string
  name: string
  avatarUrl: string | null
  connections: number
  dropsEnabled: boolean
  appVersion: string | null
  appVersions: string[]
  latestAppVersion: string
  updateAvailable: boolean
}

export type MemeDropClientMessage =
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
      dropsEnabled: boolean
    }

export type MemeDropServerMessage =
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
