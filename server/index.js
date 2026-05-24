import http from 'node:http'
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
const MEMEDROP_SERVER_KEY = process.env.MEMEDROP_SERVER_KEY ?? ''
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
let discordStatus = 'starting'

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
  if (request.url === '/health') {
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
