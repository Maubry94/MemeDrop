import http from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { config } from './config.js'
import { createDiscordBot } from './discord/client.js'
import { createDiscordOAuthHandlers } from './discord/oauth.js'
import { parseRequestUrl } from './http/request.js'
import { sendJsonResponse, sendTextResponse } from './http/responses.js'
import { sendStaticFile } from './http/staticFiles.js'
import { getSignedWindowsUpdateRequestPath } from './http/updateRoute.js'
import { sendHealthPage } from './pages/healthPage.js'
import { sendHomePage } from './pages/homePage.js'
import { createIdentityTokenService } from './security/identityToken.js'
import { createMemeDropWebSocketServer } from './websocket.js'

let discordStatus = 'starting'
const MAX_REQUESTS_PER_SOCKET = 100

const getPackageVersion = () => {
  try {
    const packagePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../package.json',
    )
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: string }
    return packageJson.version ?? '0.0.0'
  } catch (error) {
    console.warn('Version MemeDrop serveur introuvable:', error)
    return '0.0.0'
  }
}

const latestAppVersion = getPackageVersion()

const identityTokens = createIdentityTokenService({
  signingSecret: config.memedropIdentitySigningSecret,
  ttlSeconds: config.memedropIdentityTokenTtlSeconds,
})

if (
  config.memedropServerKey &&
  config.memedropIdentitySigningSecret === config.memedropServerKey
) {
  throw new Error('MEMEDROP_IDENTITY_SIGNING_SECRET must be distinct from MEMEDROP_SERVER_KEY.')
}

const oauthHandlers = createDiscordOAuthHandlers({
  clientId: config.discordClientId,
  clientSecret: config.discordClientSecret,
  publicBaseUrl: config.publicBaseUrl,
  serverKey: config.memedropServerKey,
  identityTokens,
})

const server = http.createServer((request, response) => {
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('cache-control', 'no-store')
  const requestUrl = parseRequestUrl(request.url)
  if (!requestUrl) {
    sendTextResponse(response, 400, 'Invalid MemeDrop request target.\n')
    return
  }

  const healthStatus = {
    ok: true,
    discordStatus,
    clients: clients.size,
    latestAppVersion,
  }

  if (request.method === 'GET' && requestUrl.pathname === '/') {
    sendHomePage(response, { latestAppVersion })
    return
  }

  const signedUpdateRequestPath = getSignedWindowsUpdateRequestPath(
    request.method,
    requestUrl.pathname,
  )
  if (signedUpdateRequestPath !== null) {
    if (!config.memedropUpdatesDir) {
      sendTextResponse(response, 404, 'MemeDrop updates directory is not configured.\n')
      return
    }

    void sendStaticFile(
      response,
      config.memedropUpdatesDir,
      signedUpdateRequestPath,
    ).catch((error) => {
      console.error('Envoi de mise à jour MemeDrop impossible:', error)
      if (!response.destroyed) {
        response.destroy(error instanceof Error ? error : undefined)
      }
    })
    return
  }

  if (requestUrl.pathname === '/health.json') {
    sendJsonResponse(response, 200, healthStatus)
    return
  }

  if (requestUrl.pathname === '/health') {
    if (request.headers.accept?.includes('application/json')) {
      sendJsonResponse(response, 200, healthStatus)
      return
    }

    sendHealthPage(response, healthStatus)
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/auth/discord/session') {
    oauthHandlers.handleDiscordAuthStart(request, response)
    return
  }

  if (request.method === 'GET' && requestUrl.pathname.startsWith('/auth/discord/session/')) {
    oauthHandlers.handleDiscordAuthStatus(request, response, requestUrl)
    return
  }

  if (request.method === 'GET' && requestUrl.pathname === '/auth/discord/callback') {
    void oauthHandlers.handleDiscordAuthCallback(request, response, requestUrl).catch((error) => {
      console.error('Callback OAuth Discord interrompu:', error)
      if (!response.headersSent) {
        sendTextResponse(response, 500, 'Discord OAuth callback failed.\n')
      } else if (!response.destroyed) {
        response.destroy(error instanceof Error ? error : undefined)
      }
    })
    return
  }

  sendTextResponse(response, 404, 'MemeDrop route not found.\n')
})

const { broadcastDrop, clients, getConnectedUsers, stopDropByOwner } = createMemeDropWebSocketServer({
  server,
  serverKey: config.memedropServerKey,
  latestAppVersion,
  identityTokens,
})

server.headersTimeout = 15_000
server.requestTimeout = 30_000
server.keepAliveTimeout = 5_000
server.maxHeadersCount = 64
server.maxRequestsPerSocket = MAX_REQUESTS_PER_SOCKET
server.on('clientError', (error, socket) => {
  console.warn(`Requête HTTP MemeDrop invalide: ${error.message}`)
  if (socket.writable) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
  } else {
    socket.destroy()
  }
})
server.on('error', (error) => {
  console.error('Erreur serveur HTTP MemeDrop:', error)
  process.exit(1)
})

createDiscordBot({
  token: config.discordBotToken,
  clientId: config.discordClientId,
  guildId: config.discordGuildId,
  publicBaseUrl: config.publicBaseUrl,
  latestAppVersion,
  allowedRoleIds: config.memedropAllowedRoleIds,
  allowedChannelIds: config.memedropAllowedChannelIds,
  dropCooldownSeconds: config.memedropDropCooldownSeconds,
  broadcastDrop,
  getConnectedUsers,
  stopDropByOwner,
  onStatusChange: (status) => {
    discordStatus = status
  },
})

server.listen(config.port, config.host, () => {
  console.log(`Serveur MemeDrop démarré sur http://${config.host}:${config.port}.`)
})
