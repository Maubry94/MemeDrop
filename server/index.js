import http from 'node:http'
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js'
import WebSocket, { WebSocketServer } from 'ws'
import { config as loadEnv } from 'dotenv'

loadEnv()

const PORT = Number(process.env.PORT ?? 3010)
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID
const MEMEDROP_SERVER_KEY = process.env.MEMEDROP_SERVER_KEY ?? ''

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

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload)
    }
  }
}

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

  const rest = new REST({ version: '10' }).setToken(token)

  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: [dropCommand.toJSON()],
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
    socket.close(1008, 'Invalid MemeDrop key')
    return
  }

  clients.add(socket)
  sendJson(socket, { type: 'hello' })

  socket.on('close', () => {
    clients.delete(socket)
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
      console.log('Commande /drop enregistrée.')
    }
  })

  discord.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'drop') {
      return
    }

    const attachment = interaction.options.getAttachment('fichier')
    const caption = interaction.options.getString('legende')

    if (!attachment) {
      await interaction.reply({
        content: 'Pas de fichier fourni.',
        ephemeral: true,
      })
      return
    }

    broadcastDrop({
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

    await interaction.reply({
      content: 'Drop envoyé !',
      ephemeral: true,
    })
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
