import { downloadCommand } from './download.js'
import { dropCommand } from './drop.js'
import { dropMeCommand } from './dropme.js'
import { dropStatusCommand } from './dropstatus.js'
import { dropTikTokCommand } from './droptt.js'
import { dropYouTubeCommand } from './dropyt.js'
import { helpCommand } from './help.js'
import { redropCommand } from './redrop.js'
import type { MemeDropCommand } from './types.js'

export const discordCommands: MemeDropCommand[] = [
  dropCommand,
  dropMeCommand,
  dropYouTubeCommand,
  dropTikTokCommand,
  redropCommand,
  dropStatusCommand,
  downloadCommand,
  helpCommand,
]

export const discordCommandsByName = new Map(
  discordCommands.map((command) => [command.data.name, command]),
)
