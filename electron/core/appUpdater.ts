import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import type { AppUpdateState, ServerConfig } from '../../shared/types'

const { autoUpdater } = electronUpdater

type AppUpdaterOptions = {
  getServerConfig: () => ServerConfig
  getCurrentVersion: () => string
  onStateChanged: (state: AppUpdateState) => void
}

const toHttpServerUrl = (serverUrl: string) => {
  const normalizedUrl = serverUrl.match(/^https?:\/\//i) ? serverUrl : `https://${serverUrl}`
  const url = new URL(normalizedUrl)

  if (url.protocol === 'ws:') {
    url.protocol = 'http:'
  }

  if (url.protocol === 'wss:') {
    url.protocol = 'https:'
  }

  url.pathname = ''
  url.search = ''
  url.hash = ''

  return url.toString().replace(/\/$/, '')
}

const getUpdateFeedUrl = (serverConfig: ServerConfig) =>
  `${toHttpServerUrl(serverConfig.serverUrl)}/updates/win`

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Mise à jour impossible.'

const getUserFriendlyErrorMessage = (error: unknown) => {
  const message = getErrorMessage(error)

  if (message.toLowerCase().includes('sha512 checksum mismatch')) {
    return [
      'Le fichier de mise à jour téléchargé ne correspond pas aux métadonnées du serveur.',
      'Réessaie dans quelques instants. Si le problème persiste, vide le cache de mise à jour ou réinstalle la dernière version.',
    ].join(' ')
  }

  if (
    message.includes('404') ||
    message.toLowerCase().includes('not found') ||
    message.toLowerCase().includes('file not found')
  ) {
    return 'La mise à jour est annoncée, mais le fichier est introuvable sur le serveur.'
  }

  if (
    message.toLowerCase().includes('net::') ||
    message.toLowerCase().includes('network') ||
    message.toLowerCase().includes('fetch')
  ) {
    return 'Connexion au serveur de mise à jour impossible. Vérifie ta connexion ou réessaie plus tard.'
  }

  return message
}

export const createAppUpdater = ({
  getServerConfig,
  getCurrentVersion,
  onStateChanged,
}: AppUpdaterOptions) => {
  let state: AppUpdateState = {
    status: 'idle',
    currentVersion: getCurrentVersion(),
    availableVersion: null,
    downloadProgress: null,
    errorMessage: null,
    canCheck: app.isPackaged,
    canDownload: false,
    canInstall: false,
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  const setState = (nextState: Partial<AppUpdateState>) => {
    state = {
      ...state,
      currentVersion: getCurrentVersion(),
      ...nextState,
    }

    onStateChanged({ ...state })
  }

  const configureFeed = () => {
    if (!app.isPackaged) {
      throw new Error("L'auto-update est disponible uniquement dans l'application installée.")
    }

    const serverConfig = getServerConfig()

    if (!serverConfig.serverUrl.trim()) {
      throw new Error("Configure d'abord l'URL du serveur MemeDrop.")
    }

    autoUpdater.setFeedURL({
      provider: 'generic',
      url: getUpdateFeedUrl(serverConfig),
    })
  }

  const checkForUpdates = async () => {
    if (!state.canCheck) {
      return { ...state }
    }

    try {
      configureFeed()
      await autoUpdater.checkForUpdates()
    } catch (error) {
      setState({
        status: 'error',
        errorMessage: getUserFriendlyErrorMessage(error),
        canDownload: false,
        canInstall: false,
      })
    }

    return { ...state }
  }

  const downloadUpdate = async () => {
    if (state.status === 'downloaded') {
      return { ...state }
    }

    if (state.status === 'downloading') {
      return { ...state }
    }

    try {
      configureFeed()

      if (state.status !== 'available') {
        await autoUpdater.checkForUpdates()
      }

      if (state.status === 'available') {
        await autoUpdater.downloadUpdate()
      }
    } catch (error) {
      setState({
        status: 'error',
        errorMessage: getUserFriendlyErrorMessage(error),
        canDownload: false,
        canInstall: false,
      })
    }

    return { ...state }
  }

  const installUpdate = () => {
    if (state.status !== 'downloaded') {
      return { ...state }
    }

    autoUpdater.quitAndInstall(false, true)
    return { ...state }
  }

  const getState = () => ({ ...state })

  autoUpdater.on('checking-for-update', () => {
    setState({
      status: 'checking',
      errorMessage: null,
      downloadProgress: null,
      canDownload: false,
      canInstall: false,
    })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    setState({
      status: 'available',
      availableVersion: info.version,
      errorMessage: null,
      canDownload: true,
      canInstall: false,
    })
  })

  autoUpdater.on('update-not-available', () => {
    setState({
      status: 'not-available',
      availableVersion: null,
      downloadProgress: null,
      errorMessage: null,
      canDownload: false,
      canInstall: false,
    })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    setState({
      status: 'downloading',
      downloadProgress: Math.round(progress.percent),
      errorMessage: null,
      canDownload: false,
      canInstall: false,
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    setState({
      status: 'downloaded',
      availableVersion: info.version,
      downloadProgress: 100,
      errorMessage: null,
      canDownload: false,
      canInstall: true,
    })
  })

  autoUpdater.on('error', (error: Error) => {
    setState({
      status: 'error',
      errorMessage: getUserFriendlyErrorMessage(error),
      canDownload: false,
      canInstall: false,
    })
  })

  return {
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    getState,
  }
}
