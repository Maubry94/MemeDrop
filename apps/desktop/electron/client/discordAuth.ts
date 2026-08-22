import type { DiscordUser } from '@memedrop/protocol'
import type { ServerConfig } from '../../shared/types'
import { toMemeDropServerUrl } from './serverUrl'

type DiscordAuthOptions = {
  getServerConfig: () => ServerConfig
  saveDiscordAuthentication: (
    expectedServer: Pick<ServerConfig, 'serverUrl' | 'accessKey'>,
    user: DiscordUser,
    authToken: string,
    authTokenExpiresAt: string,
  ) => ServerConfig
  clearDiscordAuthentication: () => ServerConfig
  openExternal: (url: string) => Promise<unknown>
  onConfigChanged: () => void
}

type DiscordAuthStartResponse = {
  sessionId: string
  authUrl: string
  pollToken: string
  expiresAt: string
}

type DiscordAuthStatusResponse =
  | {
      status: 'pending' | 'expired'
    }
  | {
      status: 'done'
      user: DiscordUser
      authToken: string
      authTokenExpiresAt: string
    }

const DISCORD_AUTHORIZE_ORIGIN = 'https://discord.com'
const DISCORD_AUTHORIZE_PATH = '/oauth2/authorize'
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const POLL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const OAUTH_SESSION_MAX_MS = 5 * 60 * 1000
const OAUTH_CLOCK_SKEW_MS = 60 * 1000

const getSingleSearchParameter = (url: URL, name: string): string | null => {
  const values = url.searchParams.getAll(name)
  return values.length === 1 ? values[0] : null
}

const getServerHeaders = (accessKey: string): Record<string, string> => {
  const normalizedAccessKey = accessKey.trim()

  if (normalizedAccessKey) {
    return {
      'x-memedrop-key': normalizedAccessKey,
    }
  }

  return {}
}

const requestJson = async <T>(url: URL, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...options,
    redirect: 'error',
    cache: 'no-store',
  })

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
  saveDiscordAuthentication,
  clearDiscordAuthentication,
  openExternal,
  onConfigChanged,
}: DiscordAuthOptions) => {
  const authenticateDiscord = async (): Promise<ServerConfig> => {
    const config = getServerConfig()

    if (!config.serverUrl) {
      throw new Error('URL du serveur manquante.')
    }

    const serverUrl = toMemeDropServerUrl(config.serverUrl)
    const startUrl = new URL('/auth/discord/session', serverUrl)
    const start = await requestJson<DiscordAuthStartResponse>(startUrl, {
      method: 'POST',
      headers: getServerHeaders(config.accessKey),
    })

    const sessionId = start.sessionId?.trim() ?? ''
    const pollToken = start.pollToken?.trim() ?? ''
    const expiresAtValue = start.expiresAt?.trim() ?? ''
    const sessionExpiresAt = Date.parse(expiresAtValue)
    const now = Date.now()
    let authUrl: URL
    let redirectUrl: URL

    try {
      authUrl = new URL(start.authUrl?.trim() ?? '')
      const redirectUri = getSingleSearchParameter(authUrl, 'redirect_uri') ?? ''
      if (!/^https?:\/\//i.test(redirectUri)) {
        throw new Error('Invalid Discord redirect URI')
      }
      redirectUrl = toMemeDropServerUrl(redirectUri)
    } catch {
      throw new Error('Le serveur a renvoyé une session Discord invalide.')
    }

    if (
      !UUID_V4_PATTERN.test(sessionId) ||
      !POLL_TOKEN_PATTERN.test(pollToken) ||
      !Number.isFinite(sessionExpiresAt) ||
      new Date(sessionExpiresAt).toISOString() !== expiresAtValue ||
      sessionExpiresAt <= now ||
      sessionExpiresAt > now + OAUTH_SESSION_MAX_MS + OAUTH_CLOCK_SKEW_MS ||
      authUrl.origin !== DISCORD_AUTHORIZE_ORIGIN ||
      authUrl.pathname !== DISCORD_AUTHORIZE_PATH ||
      authUrl.username ||
      authUrl.password ||
      authUrl.hash ||
      getSingleSearchParameter(authUrl, 'state') !== sessionId ||
      getSingleSearchParameter(authUrl, 'response_type') !== 'code' ||
      getSingleSearchParameter(authUrl, 'scope') !== 'identify' ||
      redirectUrl.origin !== serverUrl.origin ||
      redirectUrl.pathname !== '/auth/discord/callback' ||
      redirectUrl.search ||
      redirectUrl.hash
    ) {
      throw new Error('Le serveur a renvoyé une session Discord invalide.')
    }

    await openExternal(authUrl.toString())

    while (Date.now() < sessionExpiresAt) {
      await sleep(Math.min(1000, sessionExpiresAt - Date.now()))

      if (Date.now() >= sessionExpiresAt) {
        break
      }

      const statusUrl = new URL(
        `/auth/discord/session/${encodeURIComponent(sessionId)}`,
        serverUrl,
      )
      const status = await requestJson<DiscordAuthStatusResponse>(statusUrl, {
        headers: {
          ...getServerHeaders(config.accessKey),
          'x-memedrop-oauth-poll-token': pollToken,
        },
      })

      if (status.status === 'done') {
        const savedConfig = saveDiscordAuthentication(
          config,
          status.user,
          status.authToken,
          status.authTokenExpiresAt,
        )
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
    const savedConfig = clearDiscordAuthentication()
    onConfigChanged()
    return savedConfig
  }

  return {
    authenticateDiscord,
    disconnectDiscord,
  }
}
