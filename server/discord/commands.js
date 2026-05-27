import { REST, Routes, SlashCommandBuilder } from 'discord.js'

const createSlashCommands = () => {
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
    .addUserOption((option) =>
      option
        .setName('cible')
        .setDescription('Envoyer le drop uniquement à cette personne')
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName('anonyme')
        .setDescription('Masquer ton pseudo et ton avatar sur le drop')
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
    .addUserOption((option) =>
      option
        .setName('cible')
        .setDescription('Envoyer le drop uniquement à cette personne')
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName('anonyme')
        .setDescription('Masquer ton pseudo et ton avatar sur le drop')
        .setRequired(false),
    )

  return [dropCommand.toJSON(), dropYouTubeCommand.toJSON()]
}

export const registerSlashCommands = async (token, guildId, clientId) => {
  const rest = new REST({ version: '10' }).setToken(token)

  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: createSlashCommands(),
  })
}
