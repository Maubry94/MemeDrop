import { REST, Routes } from 'discord.js'
import { config as loadEnv } from 'dotenv'

loadEnv()

const token = process.env.DISCORD_BOT_TOKEN
const clientId = process.env.DISCORD_CLIENT_ID
const guildId = process.env.DISCORD_GUILD_ID

if (!token || !clientId || !guildId) {
  console.error('DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID et DISCORD_GUILD_ID sont requis dans le .env.')
  process.exit(1)
}

const rest = new REST({ version: '10' }).setToken(token)

console.log(
  `Suppression des commandes Discord du serveur ${guildId} pour l'application ${clientId}...`,
)

await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
  body: [],
})

console.log('Commandes du serveur supprimées. Redémarrer le serveur MemeDrop les réenregistrera.')
