import http from 'node:http'
import { createDiscordOAuthHandlers } from './auth/discordOAuth.js'
import { config } from './config.js'
import { createDiscordBot } from './discord/client.js'
import { sendJsonResponse, sendTextResponse } from './http/responses.js'
import { createMemeDropWebSocketServer } from './websocket.js'

let discordStatus = 'starting'

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

const { broadcastDrop, clients } = createMemeDropWebSocketServer({
  server,
  serverKey: config.memedropServerKey,
})

createDiscordBot({
  token: config.discordBotToken,
  guildId: config.discordGuildId,
  broadcastDrop,
  onStatusChange: (status) => {
    discordStatus = status
  },
})

server.listen(config.port, () => {
  console.log(`Serveur MemeDrop démarré sur le port ${config.port}.`)
})
