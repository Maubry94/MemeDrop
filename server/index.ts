import http from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { config } from './config.js'
import { createDiscordBot } from './discord/client.js'
import { createDiscordOAuthHandlers } from './discord/oauth.js'
import { sendJsonResponse, sendTextResponse } from './http/responses.js'
import { sendStaticFile } from './http/staticFiles.js'
import { sendHealthPage } from './pages/healthPage.js'
import { sendHomePage } from './pages/homePage.js'
import { createMemeDropWebSocketServer } from './websocket.js'

let discordStatus = 'starting'
const SIGNED_WINDOWS_UPDATE_ROUTE = '/updates/win-signed-v1/'
const LEGACY_WINDOWS_UPDATE_ROUTE = '/updates/win/'

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

const oauthHandlers = createDiscordOAuthHandlers({
  clientId: config.discordClientId,
  clientSecret: config.discordClientSecret,
  publicBaseUrl: config.publicBaseUrl,
  serverKey: config.memedropServerKey,
})

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host}`)
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

  if (request.method === 'GET' && requestUrl.pathname.startsWith(SIGNED_WINDOWS_UPDATE_ROUTE)) {
    if (!config.memedropUpdatesDir) {
      sendTextResponse(response, 404, 'MemeDrop updates directory is not configured.\n')
      return
    }

    void sendStaticFile(
      response,
      config.memedropUpdatesDir,
      requestUrl.pathname.slice(SIGNED_WINDOWS_UPDATE_ROUTE.length),
    )
    return
  }

  if (request.method === 'GET' && requestUrl.pathname.startsWith(LEGACY_WINDOWS_UPDATE_ROUTE)) {
    if (!config.memedropLegacyUpdatesDir) {
      sendTextResponse(response, 404, 'MemeDrop legacy updates directory is not configured.\n')
      return
    }

    void sendStaticFile(
      response,
      config.memedropLegacyUpdatesDir,
      requestUrl.pathname.slice(LEGACY_WINDOWS_UPDATE_ROUTE.length),
    )
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
    oauthHandlers.handleDiscordAuthStart(request, response, requestUrl)
    return
  }

  if (request.method === 'GET' && requestUrl.pathname.startsWith('/auth/discord/session/')) {
    oauthHandlers.handleDiscordAuthStatus(request, response, requestUrl)
    return
  }

  if (request.method === 'GET' && requestUrl.pathname === '/auth/discord/callback') {
    void oauthHandlers.handleDiscordAuthCallback(request, response, requestUrl)
    return
  }

  sendTextResponse(response, 404, 'MemeDrop route not found.\n')
})

const { broadcastDrop, clients, getConnectedUsers, stopDropByOwner } = createMemeDropWebSocketServer({
  server,
  serverKey: config.memedropServerKey,
  latestAppVersion,
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
