import { REST, Routes } from 'discord.js'
import { discordCommands } from './commands/index.js'

const createSlashCommands = () => discordCommands.map((command) => command.data.toJSON())

export const registerSlashCommands = async (
  token: string,
  guildId: string,
  clientId: string,
) => {
  const rest = new REST({ version: '10' }).setToken(token)

  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: createSlashCommands(),
  })
}
