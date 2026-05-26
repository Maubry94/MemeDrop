import http from 'node:http'
import { randomUUID } from 'node:crypto'
import {
  Client,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js'
import WebSocket, { WebSocketServer } from 'ws'
import { config as loadEnv } from 'dotenv'

loadEnv()

const PORT = Number(process.env.PORT ?? 3010)
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET
const MEMEDROP_SERVER_KEY = process.env.MEMEDROP_SERVER_KEY ?? ''
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL
const AUTH_SESSION_MS = 5 * 60 * 1000
const SUPPORTED_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'mp4',
  'webm',
  'mov',
  'mkv',
  'mp3',
  'wav',
  'ogg',
  'flac',
  'm4a',
])

const clients = new Set()
const authSessions = new Map()
let discordStatus = 'starting'

const sendJsonResponse = (response, statusCode, payload) => {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

const getRequestKey = (request, requestUrl) => {
  const headerKey = request.headers['x-memedrop-key']
  return requestUrl.searchParams.get('key') ?? (Array.isArray(headerKey) ? headerKey[0] : headerKey) ?? ''
}

const isAuthorizedRequest = (request, requestUrl) => {
  if (!MEMEDROP_SERVER_KEY) {
    return true
  }

  return getRequestKey(request, requestUrl) === MEMEDROP_SERVER_KEY
}

const cleanupAuthSessions = () => {
  const now = Date.now()

  for (const [sessionId, session] of authSessions) {
    if (session.expiresAt <= now) {
      authSessions.delete(sessionId)
    }
  }
}

const getPublicBaseUrl = (request) => {
  if (PUBLIC_BASE_URL) {
    return PUBLIC_BASE_URL.replace(/\/$/, '')
  }

  const protocol = request.headers['x-forwarded-proto'] ?? 'http'
  const host = request.headers['x-forwarded-host'] ?? request.headers.host
  return `${Array.isArray(protocol) ? protocol[0] : protocol}://${Array.isArray(host) ? host[0] : host}`
}

const getOAuthRedirectUri = (request) => `${getPublicBaseUrl(request)}/auth/discord/callback`

const getDiscordAvatarUrl = (user) => {
  if (!user.avatar) {
    return null
  }

  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
}

const getDiscordDisplayName = (user) => user.global_name ?? user.username ?? 'Discord'

const exchangeDiscordCode = async (request, code) => {
  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: getOAuthRedirectUri(request),
    }),
  })

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text()
    throw new Error(`Discord token exchange failed (${tokenResponse.status}): ${body}`)
  }

  const token = await tokenResponse.json()
  const userResponse = await fetch('https://discord.com/api/users/@me', {
    headers: {
      authorization: `Bearer ${token.access_token}`,
    },
  })

  if (!userResponse.ok) {
    const body = await userResponse.text()
    throw new Error(`Discord user fetch failed (${userResponse.status}): ${body}`)
  }

  const user = await userResponse.json()
  return {
    id: user.id,
    username: getDiscordDisplayName(user),
    avatarUrl: getDiscordAvatarUrl(user),
  }
}

const handleDiscordAuthStart = (request, response, requestUrl) => {
  if (!isAuthorizedRequest(request, requestUrl)) {
    console.warn('Connexion Discord refusée: clé MemeDrop invalide.')
    sendJsonResponse(response, 401, { error: 'Invalid MemeDrop key' })
    return
  }

  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
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

  const authUrl = new URL('https://discord.com/oauth2/authorize')
  authUrl.searchParams.set('client_id', DISCORD_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', getOAuthRedirectUri(request))
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'identify')
  authUrl.searchParams.set('state', sessionId)

  console.log(
    `Session OAuth Discord créée: ${sessionId}. Redirect URI: ${getOAuthRedirectUri(request)}`,
  )

  sendJsonResponse(response, 200, {
    sessionId,
    authUrl: authUrl.toString(),
    expiresAt: new Date(expiresAt).toISOString(),
  })
}

const handleDiscordAuthStatus = (request, response, requestUrl) => {
  if (!isAuthorizedRequest(request, requestUrl)) {
    console.warn('Statut OAuth Discord refusé: clé MemeDrop invalide.')
    sendJsonResponse(response, 401, { error: 'Invalid MemeDrop key' })
    return
  }

  cleanupAuthSessions()

  const sessionId = requestUrl.pathname.split('/').pop()
  const session = authSessions.get(sessionId)

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

const handleDiscordAuthCallback = async (request, response, requestUrl) => {
  const code = requestUrl.searchParams.get('code')
  const sessionId = requestUrl.searchParams.get('state')
  const session = sessionId ? authSessions.get(sessionId) : null

  if (!code || !sessionId || !session) {
    console.warn(`Callback OAuth Discord invalide ou expiré: ${sessionId ?? 'sans session'}.`)
    response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<h1>MemeDrop</h1><p>Connexion Discord invalide ou expirée.</p>')
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

    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<h1>MemeDrop</h1><p>Connexion Discord réussie. Tu peux fermer cet onglet.</p>')
  } catch (error) {
    console.error('Connexion Discord OAuth impossible:', error)
    response.writeHead(500, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<h1>MemeDrop</h1><p>Connexion Discord impossible.</p>')
  }
}

const sendJson = (socket, payload) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

const broadcastDrop = (drop) => {
  const payload = JSON.stringify({
    type: 'drop',
    drop,
  })
  let sentCount = 0

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload)
      sentCount += 1
    }
  }

  return sentCount
}

const isSupportedAttachment = (attachment) => {
  const contentType = attachment.contentType?.toLowerCase() ?? ''

  if (
    contentType.startsWith('image/') ||
    contentType.startsWith('video/') ||
    contentType.startsWith('audio/')
  ) {
    return true
  }

  const extension = attachment.name?.split('.').pop()?.toLowerCase()
  return Boolean(extension && SUPPORTED_EXTENSIONS.has(extension))
}

const getYouTubeVideoId = (value) => {
  try {
    const normalizedValue = value.match(/^https?:\/\//i) ? value : `https://${value}`
    const url = new URL(normalizedValue)
    const host = url.hostname.replace(/^www\./, '').toLowerCase()

    if (host === 'youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] ?? null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (url.pathname === '/watch') {
        return url.searchParams.get('v')
      }

      const [, kind, id] = url.pathname.split('/')
      if (['embed', 'shorts', 'live'].includes(kind)) {
        return id ?? null
      }
    }
  } catch {
    return null
  }

  return null
}

const isValidYouTubeVideoId = (value) => /^[a-zA-Z0-9_-]{11}$/.test(value)

const registerSlashCommands = async (token, guildId, clientId) => {
  const dropCommand = new SlashCommandBuilder()
    .setName('drop')
    .setDescription('Envoyer un meme via MemeDrop')
    .addAttachmentOption((option) =>
      option
        .setName('fichier')
        .setDescription('Image, vidéo, son ou fichier')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('legende')
        .setDescription('Légende optionnelle')
        .setRequired(false),
    )

  const dropYouTubeCommand = new SlashCommandBuilder()
    .setName('dropyt')
    .setDescription('Envoyer une vidéo YouTube via MemeDrop')
    .addStringOption((option) =>
      option
        .setName('lien')
        .setDescription('Lien YouTube')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('legende')
        .setDescription('Légende optionnelle')
        .setRequired(false),
    )

  const rest = new REST({ version: '10' }).setToken(token)

  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: [dropCommand.toJSON(), dropYouTubeCommand.toJSON()],
  })
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host}`)

  if (requestUrl.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        ok: true,
        discordStatus,
        clients: clients.size,
      }),
    )
    return
  }

  if (request.method === 'POST' && requestUrl.pathname === '/auth/discord/session') {
    handleDiscordAuthStart(request, response, requestUrl)
    return
  }

  if (request.method === 'GET' && requestUrl.pathname.startsWith('/auth/discord/session/')) {
    handleDiscordAuthStatus(request, response, requestUrl)
    return
  }

  if (request.method === 'GET' && requestUrl.pathname === '/auth/discord/callback') {
    void handleDiscordAuthCallback(request, response, requestUrl)
    return
  }

  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('MemeDrop server is running.\n')
})

const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (socket, request) => {
  const requestUrl = new URL(request.url ?? '/ws', `http://${request.headers.host}`)
  const requestKey = requestUrl.searchParams.get('key') ?? ''

  if (MEMEDROP_SERVER_KEY && requestKey !== MEMEDROP_SERVER_KEY) {
    console.warn('Client MemeDrop refusé: clé invalide.')
    socket.close(1008, 'Invalid MemeDrop key')
    return
  }

  clients.add(socket)
  console.log(`Client MemeDrop connecté (${clients.size} client(s)).`)
  sendJson(socket, { type: 'hello' })

  socket.on('close', () => {
    clients.delete(socket)
    console.log(`Client MemeDrop déconnecté (${clients.size} client(s)).`)
  })
})

if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
  console.error('DISCORD_BOT_TOKEN et DISCORD_GUILD_ID sont requis.')
  process.exitCode = 1
} else {
  const discord = new Client({
    intents: [GatewayIntentBits.Guilds],
  })

  discord.once('clientReady', async () => {
    discordStatus = 'connected'
    console.log(`Discord connecté en tant que ${discord.user?.tag ?? 'bot'}.`)

    if (discord.user) {
      await registerSlashCommands(DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, discord.user.id)
      console.log('Commandes /drop et /dropyt enregistrées.')
    }
  })

  discord.on('interactionCreate', async (interaction) => {
    if (
      !interaction.isChatInputCommand() ||
      !['drop', 'dropyt'].includes(interaction.commandName)
    ) {
      return
    }

    try {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      })

      const caption = interaction.options.getString('legende')
      console.log(`Commande /${interaction.commandName} reçue de ${interaction.user.tag}.`)

      if (interaction.commandName === 'dropyt') {
        const link = interaction.options.getString('lien', true)
        const youtubeVideoId = getYouTubeVideoId(link)

        if (!youtubeVideoId || !isValidYouTubeVideoId(youtubeVideoId)) {
          await interaction.editReply('Lien YouTube invalide.')
          return
        }

        const sentCount = broadcastDrop({
          id: `youtube-${youtubeVideoId}-${Date.now()}`,
          url: link,
          contentType: 'video/youtube',
          fileName: null,
          youtubeVideoId,
          caption: caption || null,
          authorId: interaction.user.id,
          author: interaction.user.username ?? null,
          authorAvatarUrl: interaction.user.displayAvatarURL({
            extension: 'png',
            size: 128,
          }),
          createdAt: new Date().toISOString(),
        })

        console.log(`Drop YouTube diffusé à ${sentCount} client(s): ${youtubeVideoId}.`)
        await interaction.editReply('Drop YouTube envoyé !')
        return
      }

      const attachment = interaction.options.getAttachment('fichier')

      if (!attachment) {
        await interaction.editReply('Pas de fichier fourni.')
        return
      }

      if (!isSupportedAttachment(attachment)) {
        await interaction.editReply('Format non supporté. Envoie une image, une vidéo ou un son.')
        return
      }

      const sentCount = broadcastDrop({
        id: attachment.id,
        url: attachment.url,
        contentType: attachment.contentType ?? null,
        fileName: attachment.name ?? null,
        caption: caption || null,
        authorId: interaction.user.id,
        author: interaction.user.username ?? null,
        authorAvatarUrl: interaction.user.displayAvatarURL({
          extension: 'png',
          size: 128,
        }),
        createdAt: new Date().toISOString(),
      })

      console.log(`Drop fichier diffusé à ${sentCount} client(s): ${attachment.name ?? attachment.id}.`)
      await interaction.editReply('Drop envoyé !')
    } catch (error) {
      console.error('Erreur lors du traitement de /drop:', error)
    }
  })

  discord.on('error', (error) => {
    discordStatus = 'error'
    console.error('Erreur Discord:', error)
  })

  discord.login(DISCORD_BOT_TOKEN).catch((error) => {
    discordStatus = 'error'
    console.error('Login Discord impossible:', error)
  })
}

server.listen(PORT, () => {
  console.log(`Serveur MemeDrop démarré sur le port ${PORT}.`)
})
