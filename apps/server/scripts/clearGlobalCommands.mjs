import { REST, Routes } from 'discord.js'
import { config as loadEnv } from 'dotenv'

loadEnv()

const token = process.env.DISCORD_BOT_TOKEN
const clientId = process.env.DISCORD_CLIENT_ID

if (!token || !clientId) {
  console.error('DISCORD_BOT_TOKEN et DISCORD_CLIENT_ID sont requis dans le .env.')
  process.exit(1)
}

const rest = new REST({ version: '10' }).setToken(token)

console.log(`Suppression des commandes globales Discord pour l'application ${clientId}...`)

await rest.put(Routes.applicationCommands(clientId), {
  body: [],
})

console.log('Commandes globales supprimées. Les commandes de serveur MemeDrop restent inchangées.')
