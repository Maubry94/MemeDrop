import type { ConnectionState, ConnectionStatus } from '../../shared/types'

export type ConnectionPresentationState =
  | 'connected'
  | 'connecting'
  | 'reconnecting'
  | 'offline'
  | 'error'

export type ConnectionPresentationTone =
  | 'success'
  | 'progress'
  | 'warning'
  | 'neutral'
  | 'danger'

export type ConnectionPresentation = {
  state: ConnectionPresentationState
  label: 'En ligne' | 'Connexion…' | 'Reconnexion…' | 'Hors ligne' | 'Erreur'
  message: string
  tone: ConnectionPresentationTone
  isError: boolean
}

const presentationStateByConnectionState: Record<ConnectionState, ConnectionPresentationState> = {
  'configuration-required': 'offline',
  'authentication-required': 'offline',
  connecting: 'connecting',
  authenticating: 'connecting',
  connected: 'connected',
  reconnecting: 'reconnecting',
  refused: 'error',
  error: 'error',
}

const presentationByState: Record<
  ConnectionPresentationState,
  Omit<ConnectionPresentation, 'message'> & { defaultMessage: string }
> = {
  connected: {
    state: 'connected',
    label: 'En ligne',
    tone: 'success',
    isError: false,
    defaultMessage: 'MemeDrop est prêt à recevoir des drops.',
  },
  connecting: {
    state: 'connecting',
    label: 'Connexion…',
    tone: 'progress',
    isError: false,
    defaultMessage: 'Connexion au serveur MemeDrop en cours.',
  },
  reconnecting: {
    state: 'reconnecting',
    label: 'Reconnexion…',
    tone: 'warning',
    isError: false,
    defaultMessage: 'Connexion interrompue. Une nouvelle tentative est en cours.',
  },
  offline: {
    state: 'offline',
    label: 'Hors ligne',
    tone: 'neutral',
    isError: false,
    defaultMessage: 'La connexion au serveur MemeDrop est inactive.',
  },
  error: {
    state: 'error',
    label: 'Erreur',
    tone: 'danger',
    isError: true,
    defaultMessage: 'La connexion au serveur MemeDrop a échoué.',
  },
}

export const getConnectionPresentation = (
  status: ConnectionStatus | null,
): ConnectionPresentation => {
  const presentationState = status
    ? presentationStateByConnectionState[status.state]
    : 'connecting'
  const { defaultMessage, ...presentation } = presentationByState[presentationState]

  return {
    ...presentation,
    message: status?.message.trim() || defaultMessage,
  }
}
