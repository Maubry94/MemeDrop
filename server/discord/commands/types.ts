import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
} from 'discord.js'
import type { Drop } from '../../../shared/types.js'
import type { BroadcastDrop, GetConnectedUsers, StopDropByOwner } from '../../types.js'

export type RecentDrop = {
  id: string
  ownerId: string
  label: string
  drop: Drop
  createdAt: number
}

export type DiscordCommandContext = {
  latestAppVersion: string
  publicBaseUrl?: string
  allowedRoleIds: string[]
  dropCooldownSeconds: number
  cooldowns: Map<string, number>
  recentDrops: RecentDrop[]
  broadcastDrop: BroadcastDrop
  getConnectedUsers: GetConnectedUsers
  stopDropByOwner: StopDropByOwner
}

export type MemeDropCommand = {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder
  isDropCommand?: boolean
  execute: (
    interaction: ChatInputCommandInteraction,
    context: DiscordCommandContext,
  ) => Promise<boolean | void>
  autocomplete?: (
    interaction: AutocompleteInteraction,
    context: DiscordCommandContext,
  ) => Promise<boolean>
}
