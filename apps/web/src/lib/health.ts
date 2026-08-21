export type HealthPayload = {
  ok: true
  discordStatus: string
  clients: number
  latestAppVersion: string
}

export type HealthTone = 'success' | 'warning' | 'danger' | 'neutral'
export type OverallHealth = 'operational' | 'degraded' | 'unavailable'

export type HealthPresentation = {
  state: OverallHealth
  title: string
  description: string
  tone: HealthTone
  server: {
    label: string
    tone: HealthTone
  }
  discord: {
    label: string
    tone: HealthTone
  }
  clients: string
  version: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const parseHealthPayload = (value: unknown): HealthPayload | null => {
  if (!isRecord(value) || value.ok !== true) {
    return null
  }

  if (
    typeof value.discordStatus !== 'string'
    || value.discordStatus.trim().length === 0
    || typeof value.clients !== 'number'
    || !Number.isSafeInteger(value.clients)
    || value.clients < 0
    || typeof value.latestAppVersion !== 'string'
    || value.latestAppVersion.trim().length === 0
  ) {
    return null
  }

  return {
    ok: true,
    discordStatus: value.discordStatus,
    clients: value.clients,
    latestAppVersion: value.latestAppVersion,
  }
}

const getDiscordPresentation = (status: string): HealthPresentation['discord'] => {
  if (status === 'connected') {
    return { label: 'En ligne', tone: 'success' }
  }

  if (status === 'starting') {
    return { label: 'Démarrage', tone: 'warning' }
  }

  return { label: 'Hors ligne', tone: 'danger' }
}

export const getHealthPresentation = (payload: HealthPayload | null): HealthPresentation => {
  if (!payload) {
    return {
      state: 'unavailable',
      title: 'Serveur MemeDrop indisponible',
      description: 'Le site reste accessible, mais les drops et la connexion Discord peuvent être interrompus.',
      tone: 'danger',
      server: { label: 'Indisponible', tone: 'danger' },
      discord: { label: 'Inconnu', tone: 'neutral' },
      clients: '—',
      version: '—',
    }
  }

  const discord = getDiscordPresentation(payload.discordStatus)
  const isOperational = payload.discordStatus === 'connected'

  return {
    state: isOperational ? 'operational' : 'degraded',
    title: isOperational ? 'Tous les services sont opérationnels' : 'Service dégradé',
    description: isOperational
      ? 'Le serveur MemeDrop et le bot Discord répondent normalement.'
      : 'Le serveur MemeDrop répond, mais le bot Discord n’est pas encore pleinement disponible.',
    tone: isOperational ? 'success' : 'warning',
    server: { label: 'Disponible', tone: 'success' },
    discord,
    clients: String(payload.clients),
    version: payload.latestAppVersion,
  }
}
