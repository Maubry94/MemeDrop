export type Drop = {
  id: string
  url: string
  contentType: string | null
  fileName: string | null
  caption: string | null
  author: string | null
  authorAvatarUrl: string | null
  createdAt: string
}

export type ConnectionStatus = {
  level: 'info' | 'error'
  message: string
}

export type ServerConfig = {
  serverUrl: string
  accessKey: string
}

export type OverlayState = {
  dropsEnabled: boolean
}

export type ShortcutStatus = {
  accelerator: string
  label: string
  registered: boolean
}
