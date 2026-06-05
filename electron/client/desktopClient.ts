import type {
  AppVersionInfo,
  ConnectedUser,
  ConnectionStatus,
  Drop,
  ServerConfig,
} from '../../shared/types'
import { startMemeDropClient, type MemeDropClientController } from './memedropClient'
import { compareAppVersions, getReleaseUrl } from '../core/versionInfo'

type DesktopClientOptions = {
  getServerConfig: () => ServerConfig
  getAppVersion: () => string
  getDropsEnabled: () => boolean
  getHideOwnDrops: () => boolean
  onConnectedUsers: (users: ConnectedUser[]) => void
  onAppVersionInfo: (info: AppVersionInfo) => void
  onDrop: (drop: Drop) => void
  onControlOnlyDrop: (drop: Drop) => void
  onClearDrop: () => void
  onStatus: (status: ConnectionStatus) => void
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

  const startOrRestart = () => {
    client?.stop()
    client = null

    const serverConfig = getServerConfig()
    const { serverUrl, accessKey, discordUserId } = serverConfig

    client = startMemeDropClient({
      serverUrl,
      accessKey,
      userId: discordUserId,
      userName: serverConfig.discordUserName,
      userAvatarUrl: serverConfig.discordUserAvatarUrl,
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
