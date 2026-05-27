import { randomUUID } from 'node:crypto'
import type http from 'node:http'
import type { DiscordUser } from '../../shared/types.js'
import { sendAuthPage } from './authPages.js'
import { isAuthorizedRequest } from '../http/authKey.js'
import { sendJsonResponse } from '../http/responses.js'

const AUTH_SESSION_MS = 5 * 60 * 1000

type DiscordOAuthOptions = {
  clientId?: string
  clientSecret?: string
  publicBaseUrl?: string
  serverKey: string
}

type DiscordOAuthSession =
  | {
      status: 'pending'
      expiresAt: number
    }
  | {
      status: 'done'
      expiresAt: number
      user: DiscordUser
    }

type DiscordApiUser = {
  id: string
  username?: string
  global_name?: string | null
  avatar?: string | null
}

type DiscordTokenResponse = {
  access_token: string
}

const getHeaderValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value

const getPublicBaseUrl = (request: http.IncomingMessage, publicBaseUrl?: string) => {
  if (publicBaseUrl) {
    return publicBaseUrl.replace(/\/$/, '')
  }

  const protocol = getHeaderValue(request.headers['x-forwarded-proto']) ?? 'http'
  const host = getHeaderValue(request.headers['x-forwarded-host']) ?? request.headers.host ?? 'localhost'
  return `${protocol}://${host}`
}

const getOAuthRedirectUri = (request: http.IncomingMessage, publicBaseUrl?: string) =>
  `${getPublicBaseUrl(request, publicBaseUrl)}/auth/discord/callback`

const getDiscordAvatarUrl = (user: DiscordApiUser): string | null => {
  if (!user.avatar) {
    return null
  }

  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
}

const getDiscordDisplayName = (user: DiscordApiUser): string =>
  user.global_name ?? user.username ?? 'Discord'

export const createDiscordOAuthHandlers = ({
  clientId,
  clientSecret,
  publicBaseUrl,
  serverKey,
}: DiscordOAuthOptions) => {
  const authSessions = new Map<string, DiscordOAuthSession>()

  const cleanupAuthSessions = () => {
    const now = Date.now()

    for (const [sessionId, session] of authSessions) {
      if (session.expiresAt <= now) {
        authSessions.delete(sessionId)
      }
    }
  }

  const exchangeDiscordCode = async (
    request: http.IncomingMessage,
    code: string,
  ): Promise<DiscordUser> => {
    if (!clientId || !clientSecret) {
      throw new Error('Discord OAuth is not configured.')
    }

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: getOAuthRedirectUri(request, publicBaseUrl),
      }),
    })

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text()
      throw new Error(`Discord token exchange failed (${tokenResponse.status}): ${body}`)
    }

    const token = (await tokenResponse.json()) as DiscordTokenResponse
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        authorization: `Bearer ${token.access_token}`,
      },
    })

    if (!userResponse.ok) {
      const body = await userResponse.text()
      throw new Error(`Discord user fetch failed (${userResponse.status}): ${body}`)
    }

    const user = (await userResponse.json()) as DiscordApiUser
    return {
      id: user.id,
      username: getDiscordDisplayName(user),
      avatarUrl: getDiscordAvatarUrl(user),
    }
  }

  const handleDiscordAuthStart = (
    request: http.IncomingMessage,
    response: http.ServerResponse,
    requestUrl: URL,
  ) => {
    if (!isAuthorizedRequest(request, requestUrl, serverKey)) {
      console.warn('Connexion Discord refusée: clé MemeDrop invalide.')
      sendJsonResponse(response, 401, { error: 'Invalid MemeDrop key' })
      return
    }

    if (!clientId || !clientSecret) {
      console.warn('Connexion Discord refusée: OAuth Discord non configuré.')
      sendJsonResponse(response, 503, { error: 'Discord OAuth is not configured.' })
      return
    }

    cleanupAuthSessions()

    const sessionId = randomUUID()
    const expiresAt = Date.now() + AUTH_SESSION_MS
    authSessions.set(sessionId, {
      status: 'pending',
      expiresAt,
    })

    const redirectUri = getOAuthRedirectUri(request, publicBaseUrl)
    const authUrl = new URL('https://discord.com/oauth2/authorize')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', 'identify')
    authUrl.searchParams.set('state', sessionId)

    console.log(`Session OAuth Discord créée: ${sessionId}. Redirect URI: ${redirectUri}`)

    sendJsonResponse(response, 200, {
      sessionId,
      authUrl: authUrl.toString(),
      expiresAt: new Date(expiresAt).toISOString(),
    })
  }

  const handleDiscordAuthStatus = (
    request: http.IncomingMessage,
    response: http.ServerResponse,
    requestUrl: URL,
  ) => {
    if (!isAuthorizedRequest(request, requestUrl, serverKey)) {
      console.warn('Statut OAuth Discord refusé: clé MemeDrop invalide.')
      sendJsonResponse(response, 401, { error: 'Invalid MemeDrop key' })
      return
    }

    cleanupAuthSessions()

    const sessionId = requestUrl.pathname.split('/').pop()
    if (!sessionId) {
      sendJsonResponse(response, 404, { status: 'expired' })
      return
    }

    const session = sessionId ? authSessions.get(sessionId) : undefined

    if (!session) {
      console.warn(`Session OAuth Discord introuvable ou expirée: ${sessionId}.`)
      sendJsonResponse(response, 404, { status: 'expired' })
      return
    }

    if (session.status === 'done') {
      authSessions.delete(sessionId)
      console.log(`Session OAuth Discord terminée: ${sessionId}.`)
      sendJsonResponse(response, 200, {
        status: 'done',
        user: session.user,
      })
      return
    }

    sendJsonResponse(response, 200, {
      status: 'pending',
    })
  }

  const handleDiscordAuthCallback = async (
    request: http.IncomingMessage,
    response: http.ServerResponse,
    requestUrl: URL,
  ) => {
    const code = requestUrl.searchParams.get('code')
    const sessionId = requestUrl.searchParams.get('state')
    const session = sessionId ? authSessions.get(sessionId) : null

    if (!code || !sessionId || !session) {
      console.warn(`Callback OAuth Discord invalide ou expiré: ${sessionId ?? 'sans session'}.`)
      sendAuthPage(response, {
        title: 'Connexion invalide',
        message: 'La session Discord est invalide ou expirée. Relance la connexion depuis MemeDrop.',
        tone: 'warning',
      })
      return
    }

    try {
      const user = await exchangeDiscordCode(request, code)
      console.log(`Callback OAuth Discord reçu pour ${user.username} (${user.id}).`)
      authSessions.set(sessionId, {
        status: 'done',
        expiresAt: Date.now() + AUTH_SESSION_MS,
        user,
      })

      sendAuthPage(response, {
        title: 'Connexion réussie',
        message: 'Ton compte Discord est maintenant lié à MemeDrop. Tu peux fermer cet onglet.',
      })
    } catch (error) {
      console.error('Connexion Discord OAuth impossible:', error)
      sendAuthPage(response, {
        title: 'Connexion impossible',
        message: 'Discord a refusé la connexion. Vérifie la configuration OAuth du serveur MemeDrop.',
        tone: 'error',
      })
    }
  }

  return {
    handleDiscordAuthStart,
    handleDiscordAuthStatus,
    handleDiscordAuthCallback,
  }
}
