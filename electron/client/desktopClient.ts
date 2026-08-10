import type {
  AppVersionInfo,
  ConnectedUser,
  ConnectionStatus,
  Drop,
  ServerConnectionConfig,
} from '../../shared/types'
import { startMemeDropClient, type MemeDropClientController } from './memedropClient'
import { compareAppVersions, getReleaseUrl } from '../core/versionInfo'

type DesktopClientOptions = {
  getServerConfig: () => ServerConnectionConfig
  getAppVersion: () => string
  getDropsEnabled: () => boolean
  getHideOwnDrops: () => boolean
  onConnectedUsers: (users: ConnectedUser[]) => void
  onAppVersionInfo: (info: AppVersionInfo) => void
  onDrop: (drop: Drop) => void
  onControlOnlyDrop: (drop: Drop) => void
  onClearDrop: () => void
  onStatus: (status: ConnectionStatus) => void
  onAuthenticationRejected: () => void
}

export const createDesktopClient = ({
  getServerConfig,
  getAppVersion,
  getDropsEnabled,
  getHideOwnDrops,
  onConnectedUsers,
  onAppVersionInfo,
  onDrop,
  onControlOnlyDrop,
  onClearDrop,
  onStatus,
  onAuthenticationRejected,
}: DesktopClientOptions) => {
  let client: MemeDropClientController | null = null
  let connectedUsers: ConnectedUser[] = []
  let currentServerDrop: Drop | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let appVersionInfo: AppVersionInfo = {
    currentVersion: getAppVersion(),
    latestVersion: getAppVersion(),
    updateAvailable: false,
    releaseUrl: getReleaseUrl(getAppVersion()),
  }

  const setLatestAppVersion = (latestVersion: string) => {
    const currentVersion = getAppVersion()

    appVersionInfo = {
      currentVersion,
      latestVersion,
      updateAvailable: compareAppVersions(currentVersion, latestVersion) < 0,
      releaseUrl: getReleaseUrl(latestVersion),
    }

    onAppVersionInfo(appVersionInfo)
  }

  const completeDrop = (dropId: string) => {
    client?.completeDrop(dropId)
  }

  const clearConnectionState = () => {
    connectedUsers = []
    currentServerDrop = null
    onConnectedUsers(connectedUsers)
    onClearDrop()
  }

  const startOrRestart = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    client?.stop()
    client = null
    clearConnectionState()

    const serverConfig = getServerConfig()
    const { serverUrl, accessKey, discordUserId } = serverConfig

    client = startMemeDropClient({
      serverUrl,
      accessKey,
      authToken: serverConfig.authToken,
      appVersion: getAppVersion(),
      dropsEnabled: getDropsEnabled(),
      onConnectedUsers: (users: ConnectedUser[], latestAppVersion: string) => {
        setLatestAppVersion(latestAppVersion)
        connectedUsers = users
        onConnectedUsers(connectedUsers)
      },
      onDrop: (drop: Drop) => {
        currentServerDrop = drop
        if (!getDropsEnabled()) {
          completeDrop(drop.id)
          return
        }
        if (!discordUserId) {
          completeDrop(drop.id)
          return
        }
        if (getHideOwnDrops() && (drop.ownerId ?? drop.authorId) === discordUserId) {
          onControlOnlyDrop(drop)
          completeDrop(drop.id)
          return
        }
        onDrop(drop)
      },
      onClearDrop: () => {
        currentServerDrop = null
        onClearDrop()
      },
      onStatus,
      onAuthenticationRejected: () => {
        clearConnectionState()
        onAuthenticationRejected()
      },
    })
  }

  const scheduleReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      startOrRestart()
    }, 5000)
  }

  const updateDropsEnabled = (enabled: boolean) => {
    client?.updateDropsEnabled(enabled)
  }

  const stopCurrentDropForEveryone = () => {
    if (!currentServerDrop) {
      return
    }
    client?.stopDrop(currentServerDrop.id)
  }

  const getConnectedUsers = () => connectedUsers

  const getAppVersionInfo = (): AppVersionInfo => ({ ...appVersionInfo })

  const dispose = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    client?.stop()
    client = null
  }

  return {
    startOrRestart,
    scheduleReconnect,
    updateDropsEnabled,
    completeDrop,
    stopCurrentDropForEveryone,
    getConnectedUsers,
    getAppVersionInfo,
    dispose,
  }
}
