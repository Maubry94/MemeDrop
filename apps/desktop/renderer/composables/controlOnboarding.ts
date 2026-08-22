import type { ServerConfig } from '../../shared/types'

export type ControlOnboardingStep =
  | 'loading'
  | 'server-setup'
  | 'discord-authentication'
  | 'complete'

type ControlConnectionConfig = Pick<
  ServerConfig,
  'serverUrl' | 'accessKey' | 'discordUserId'
>

export const isServerConfigComplete = (
  config: Pick<ControlConnectionConfig, 'serverUrl' | 'accessKey'>,
): boolean =>
  Boolean(config.serverUrl.trim()) &&
  new TextEncoder().encode(config.accessKey.trim()).length >= 16

export const getControlOnboardingStep = ({
  isInitialStateLoaded,
  serverConfig,
}: {
  isInitialStateLoaded: boolean
  serverConfig: ControlConnectionConfig
}): ControlOnboardingStep => {
  if (!isInitialStateLoaded) {
    return 'loading'
  }

  // Keep the authenticated control panel stable while its server form is being
  // edited. Saving a changed endpoint revokes the identity in the main process,
  // at which point the returned config naturally resumes onboarding.
  if (serverConfig.discordUserId.trim()) {
    return 'complete'
  }

  if (!isServerConfigComplete(serverConfig)) {
    return 'server-setup'
  }

  return 'discord-authentication'
}
