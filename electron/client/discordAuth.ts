import type { DiscordUser, ServerConfig } from '../../shared/types'

type DiscordAuthOptions = {
  getServerConfig: () => ServerConfig
  saveServerConfig: (config: ServerConfig) => ServerConfig
  openExternal: (url: string) => Promise<unknown>
  onConfigChanged: () => void
}

type DiscordAuthStartResponse = {
  sessionId: string
  authUrl: string
}

type DiscordAuthStatusResponse =
  | {
      status: 'pending' | 'expired'
    }
  | {
      status: 'done'
      user: DiscordUser
    }

const toServerHttpUrl = (serverUrl: string) => {
  const normalizedUrl = serverUrl.match(/^https?:\/\//i) ? serverUrl : `https://${serverUrl}`
  return new URL(normalizedUrl)
}

const withServerKey = (url: URL, accessKey: string) => {
  if (accessKey) {
    url.searchParams.set('key', accessKey)
  }

  return url
}

const requestJson = async <T>(url: URL, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, options)

  if (!response.ok) {
    const body = await response.text()
    let message = body

    try {
      const json = JSON.parse(body) as { error?: string }
      message = json.error ?? body
    } catch {
      // Keep the raw response body when the server did not return JSON.
    }

    throw new Error(message || `HTTP ${response.status}`)
  }

  return response.json() as Promise<T>
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const createDiscordAuth = ({
  getServerConfig,
  saveServerConfig,
  openExternal,
  onConfigChanged,
}: DiscordAuthOptions) => {
  const authenticateDiscord = async (): Promise<ServerConfig> => {
    const config = getServerConfig()

    if (!config.serverUrl) {
      throw new Error('URL du serveur manquante.')
    }

    const serverUrl = toServerHttpUrl(config.serverUrl)
    const startUrl = withServerKey(new URL('/auth/discord/session', serverUrl), config.accessKey)
    const start = await requestJson<DiscordAuthStartResponse>(startUrl, {
      method: 'POST',
    })

    await openExternal(start.authUrl)

    for (let attempt = 0; attempt < 150; attempt += 1) {
      await sleep(1000)

      const statusUrl = withServerKey(
        new URL(`/auth/discord/session/${start.sessionId}`, serverUrl),
        config.accessKey,
      )
      const status = await requestJson<DiscordAuthStatusResponse>(statusUrl)

      if (status.status === 'done') {
        const savedConfig = saveServerConfig({
          ...config,
          discordUserId: status.user.id,
          discordUserName: status.user.username,
          discordUserAvatarUrl: status.user.avatarUrl,
        })
        onConfigChanged()
        return savedConfig
      }

      if (status.status === 'expired') {
        throw new Error('Session Discord expirée.')
      }
    }

    throw new Error('Connexion Discord expirée.')
  }

  const disconnectDiscord = (): ServerConfig => {
    const config = getServerConfig()
    const savedConfig = saveServerConfig({
      ...config,
      discordUserId: '',
      discordUserName: '',
      discordUserAvatarUrl: null,
    })
    onConfigChanged()
    return savedConfig
  }

  return {
    authenticateDiscord,
    disconnectDiscord,
  }
}
