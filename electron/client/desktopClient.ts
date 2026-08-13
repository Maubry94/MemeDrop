import type {
  AppVersionInfo,
  ConnectedUser,
  ConnectionStatus,
  Drop,
  ServerConnectionConfig,
} from '../../shared/types'
import { startMemeDropClient, type MemeDropClientController } from './memedropClient.ts'
import { compareAppVersions, getReleaseUrl } from '../core/versionInfo.ts'

type StartMemeDropClient = typeof startMemeDropClient

type DesktopClientOptions = {
  getServerConfig: () => ServerConnectionConfig
  getAppVersion: () => string
  getDropsEnabled: () => boolean
  getHideOwnDrops: () => boolean
  onConnectedUsers: (users: ConnectedUser[]) => void
  onAppVersionInfo: (info: AppVersionInfo) => void
  onIncomingDrop: () => void
  onDrop: (drop: Drop) => void
  onControlOnlyDrop: (drop: Drop) => void
  onClearDrop: () => void
  onStatus: (status: ConnectionStatus) => void
  onAuthenticationRejected: () => void
  startClient?: StartMemeDropClient
}

export const createDesktopClient = ({
  getServerConfig,
  getAppVersion,
  getDropsEnabled,
  getHideOwnDrops,
  onConnectedUsers,
  onAppVersionInfo,
  onIncomingDrop,
  onDrop,
  onControlOnlyDrop,
  onClearDrop,
  onStatus,
  onAuthenticationRejected,
  startClient = startMemeDropClient,
}: DesktopClientOptions) => {
  let client: MemeDropClientController | null = null
  let connectedUsers: ConnectedUser[] = []
  let currentServerDrop: Drop | null = null
  let currentPresentedDrop: Drop | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let clientGeneration = 0
  let disposed = false
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

  const completeDrop = (dropId: string): boolean => {
    if (!currentServerDrop || currentServerDrop.id !== dropId) {
      return false
    }

    if (!client?.completeDrop(dropId)) {
      return false
    }
    if (currentPresentedDrop?.id === dropId) {
      currentPresentedDrop = null
    }
    return true
  }

  const clearConnectionState = () => {
    connectedUsers = []
    currentServerDrop = null
    currentPresentedDrop = null
    onConnectedUsers(connectedUsers)
    onClearDrop()
  }

  const startOrRestart = () => {
    if (disposed) {
      return
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    const generation = ++clientGeneration
    client?.stop()
    client = null
    clearConnectionState()

    const serverConfig = getServerConfig()
    const { serverUrl, accessKey, discordUserId } = serverConfig

    client = startClient({
      serverUrl,
      accessKey,
      authToken: serverConfig.authToken,
      appVersion: getAppVersion(),
      dropsEnabled: getDropsEnabled(),
      onConnectedUsers: (users: ConnectedUser[], latestAppVersion: string) => {
        if (disposed || generation !== clientGeneration) {
          return
        }
        setLatestAppVersion(latestAppVersion)
        connectedUsers = users
        onConnectedUsers(connectedUsers)
      },
      onDrop: (drop: Drop) => {
        if (disposed || generation !== clientGeneration) {
          return
        }
        onIncomingDrop()
        currentServerDrop = drop
        currentPresentedDrop = null
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
        currentPresentedDrop = drop
        onDrop(drop)
      },
      onClearDrop: () => {
        if (disposed || generation !== clientGeneration) {
          return
        }
        currentServerDrop = null
        currentPresentedDrop = null
        onClearDrop()
      },
      onDisconnected: () => {
        if (disposed || generation !== clientGeneration) {
          return
        }
        clearConnectionState()
      },
      onStatus: (status) => {
        if (disposed || generation !== clientGeneration) {
          return
        }
        onStatus(status)
      },
      onAuthenticationRejected: () => {
        if (disposed || generation !== clientGeneration) {
          return
        }
        onAuthenticationRejected()
      },
    })
  }

  const scheduleReconnect = () => {
    if (disposed || reconnectTimer) {
      return
    }

    const generation = ++clientGeneration
    client?.stop()
    client = null
    clearConnectionState()

    const timer = setTimeout(() => {
      if (disposed || reconnectTimer !== timer || generation !== clientGeneration) {
        return
      }

      reconnectTimer = null
      startOrRestart()
    }, 5000)
    reconnectTimer = timer
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

  const getPresentedDrop = (): Drop | null =>
    currentPresentedDrop ? { ...currentPresentedDrop } : null

  const getCurrentDrop = (): Drop | null =>
    currentServerDrop ? { ...currentServerDrop } : null

  const getCurrentDropId = () => currentServerDrop?.id ?? null

  const getAppVersionInfo = (): AppVersionInfo => ({ ...appVersionInfo })

  const dispose = () => {
    if (disposed) {
      return
    }

    disposed = true
    clientGeneration += 1
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
    getPresentedDrop,
    getCurrentDrop,
    getCurrentDropId,
    getAppVersionInfo,
    dispose,
  }
}
