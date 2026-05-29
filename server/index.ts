import http from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createDiscordOAuthHandlers } from './auth/discordOAuth.js'
import { config } from './config.js'
import { createDiscordBot } from './discord/client.js'
import { sendJsonResponse, sendTextResponse } from './http/responses.js'
import { createMemeDropWebSocketServer } from './websocket.js'

let discordStatus = 'starting'

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

  if (requestUrl.pathname === '/health') {
    sendJsonResponse(response, 200, {
      ok: true,
      discordStatus,
      clients: clients.size,
    })
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

  sendTextResponse(response, 200, 'MemeDrop server is running.\n')
})

const { broadcastDrop, clients, getConnectedUsers, stopDropByOwner } = createMemeDropWebSocketServer({
  server,
  serverKey: config.memedropServerKey,
  latestAppVersion,
})

createDiscordBot({
  token: config.discordBotToken,
  guildId: config.discordGuildId,
  latestAppVersion,
  broadcastDrop,
  getConnectedUsers,
  stopDropByOwner,
  onStatusChange: (status) => {
    discordStatus = status
  },
})

server.listen(config.port, () => {
  console.log(`Serveur MemeDrop démarré sur le port ${config.port}.`)
})
