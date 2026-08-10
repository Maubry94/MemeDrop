import { rm } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater'
import type { AppUpdateState } from '../../shared/types'
import {
  fetchAndVerifyUpdateManifest,
  verifyDownloadedUpdate,
  type VerifiedUpdateManifest,
} from './updateSignature'

const { autoUpdater } = electronUpdater

type AppUpdaterOptions = {
  enabled: boolean
  feedUrl: string
  getCurrentVersion: () => string
  onStateChanged: (state: AppUpdateState) => void
}

type ActiveOperation = {
  kind: 'check' | 'download' | 'install'
  generation: number
}

type AuthenticatedUpdate = {
  generation: number
  info: UpdateInfo
  manifest: VerifiedUpdateManifest
}

type VerifiedDownload = {
  generation: number
  filePath: string
  manifest: VerifiedUpdateManifest
}

type DownloadedEvent = {
  generation: number
  filePath: string
  version: string
}

const AUTO_UPDATE_DISABLED_MESSAGE =
  "L'auto-update est désactivé dans ce build local."

const getSecureFeedUrl = (feedUrl: string) => {
  const url = new URL(feedUrl)

  if (url.protocol !== 'https:') {
    throw new Error('Le serveur de mise à jour doit obligatoirement utiliser HTTPS.')
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("L'URL de mise à jour ne doit contenir ni identifiants, ni paramètres, ni fragment.")
  }

  return url.toString().replace(/\/$/, '')
}

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
    return 'La mise à jour est annoncée, mais un fichier signé est introuvable sur le serveur.'
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

const normalizeDownloadedPath = (filePath: string) => {
  const normalized = path.resolve(filePath)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

export const createAppUpdater = ({
  enabled,
  feedUrl,
  getCurrentVersion,
  onStateChanged,
}: AppUpdaterOptions) => {
  let state: AppUpdateState = {
    status: enabled ? 'idle' : 'disabled',
    currentVersion: getCurrentVersion(),
    availableVersion: null,
    downloadProgress: null,
    errorMessage: enabled ? null : AUTO_UPDATE_DISABLED_MESSAGE,
    canCheck: enabled && app.isPackaged,
    canDownload: false,
    canInstall: false,
  }
  let generation = 0
  let activeOperation: ActiveOperation | null = null
  let authenticatedUpdate: AuthenticatedUpdate | null = null
  let verifiedDownload: VerifiedDownload | null = null
  let downloadedEvent: DownloadedEvent | null = null

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.autoRunAppAfterInstall = true
  autoUpdater.disableWebInstaller = true
  autoUpdater.disableDifferentialDownload = true

  const setState = (nextState: Partial<AppUpdateState>) => {
    state = {
      ...state,
      currentVersion: getCurrentVersion(),
      ...nextState,
    }

    onStateChanged({ ...state })
  }

  const configureFeed = () => {
    if (!enabled) {
      throw new Error(AUTO_UPDATE_DISABLED_MESSAGE)
    }

    if (!app.isPackaged) {
      throw new Error("L'auto-update est disponible uniquement dans l'application installée.")
    }

    autoUpdater.setFeedURL({
      provider: 'generic',
      url: getSecureFeedUrl(feedUrl),
    })
  }

  const clearTrustedUpdate = () => {
    authenticatedUpdate = null
    verifiedDownload = null
    downloadedEvent = null
  }

  const startOperation = (kind: ActiveOperation['kind']) => {
    generation += 1
    clearTrustedUpdate()
    const operation = { kind, generation }
    activeOperation = operation
    return operation
  }

  const transferAuthenticatedUpdate = (
    operation: ActiveOperation,
    update: AuthenticatedUpdate,
  ) => {
    authenticatedUpdate = {
      ...update,
      generation: operation.generation,
    }
  }

  const isCurrentOperation = (operation: ActiveOperation) =>
    operation.generation === generation &&
    activeOperation?.generation === operation.generation &&
    activeOperation.kind === operation.kind

  const finishOperation = (operation: ActiveOperation) => {
    if (activeOperation?.generation === operation.generation) {
      activeOperation = null
    }
  }

  const failCurrentOperation = (operation: ActiveOperation, error: unknown) => {
    if (!isCurrentOperation(operation)) {
      return
    }

    generation += 1
    clearTrustedUpdate()
    setState({
      status: 'error',
      errorMessage: getUserFriendlyErrorMessage(error),
      downloadProgress: null,
      canDownload: false,
      canInstall: false,
    })
  }

  const discardDownloadedFile = async (filePath: string | null) => {
    if (!filePath) {
      return
    }

    try {
      await rm(filePath, { force: true })
    } catch {
      // L'état reste non installable même si un antivirus verrouille temporairement le cache.
    }
  }

  const authenticateAvailableUpdate = async (operation: ActiveOperation) => {
    configureFeed()
    setState({
      status: 'checking',
      availableVersion: null,
      downloadProgress: null,
      errorMessage: null,
      canDownload: false,
      canInstall: false,
    })

    const result = await autoUpdater.checkForUpdates()
    if (!isCurrentOperation(operation)) {
      return null
    }

    if (!result) {
      throw new Error("Le serveur de mise à jour n'a renvoyé aucune information exploitable.")
    }

    if (!result.isUpdateAvailable) {
      setState({
        status: 'not-available',
        availableVersion: null,
        downloadProgress: null,
        errorMessage: null,
        canDownload: false,
        canInstall: false,
      })
      return null
    }

    const manifest = await fetchAndVerifyUpdateManifest({
      feedUrl: getSecureFeedUrl(feedUrl),
      updateInfo: result.updateInfo,
    })
    if (!isCurrentOperation(operation)) {
      return null
    }

    const update = {
      generation: operation.generation,
      info: result.updateInfo,
      manifest,
    }
    authenticatedUpdate = update
    setState({
      status: 'available',
      availableVersion: manifest.version,
      downloadProgress: null,
      errorMessage: null,
      canDownload: true,
      canInstall: false,
    })
    return update
  }

  const checkForUpdates = async () => {
    if (!state.canCheck || activeOperation) {
      return { ...state }
    }

    const operation = startOperation('check')
    try {
      await authenticateAvailableUpdate(operation)
    } catch (error) {
      failCurrentOperation(operation, error)
    } finally {
      finishOperation(operation)
    }

    return { ...state }
  }

  const downloadUpdate = async () => {
    if (!state.canCheck || activeOperation) {
      return { ...state }
    }

    if (state.status === 'downloaded' && verifiedDownload) {
      return { ...state }
    }

    const previouslyAuthenticatedUpdate = authenticatedUpdate
    const operation = startOperation('download')
    let downloadedFilePath: string | null = null

    try {
      let update: AuthenticatedUpdate | null = null
      if (previouslyAuthenticatedUpdate && state.status === 'available') {
        transferAuthenticatedUpdate(operation, previouslyAuthenticatedUpdate)
        update = authenticatedUpdate
      } else {
        update = await authenticateAvailableUpdate(operation)
      }

      if (!update || !isCurrentOperation(operation)) {
        return { ...state }
      }

      setState({
        status: 'downloading',
        availableVersion: update.manifest.version,
        downloadProgress: 0,
        errorMessage: null,
        canDownload: false,
        canInstall: false,
      })

      const downloadedFiles = await autoUpdater.downloadUpdate()
      if (!isCurrentOperation(operation)) {
        return { ...state }
      }

      if (downloadedFiles.length !== 1) {
        throw new Error("L'updater a téléchargé un ensemble de fichiers inattendu.")
      }

      downloadedFilePath = downloadedFiles[0]
      if (
        !downloadedEvent ||
        downloadedEvent.generation !== operation.generation ||
        downloadedEvent.version !== update.manifest.version ||
        normalizeDownloadedPath(downloadedEvent.filePath) !==
          normalizeDownloadedPath(downloadedFilePath)
      ) {
        throw new Error("L'updater n'a pas confirmé le fichier téléchargé attendu.")
      }

      setState({
        status: 'verifying',
        availableVersion: update.manifest.version,
        downloadProgress: 100,
        errorMessage: null,
        canDownload: false,
        canInstall: false,
      })
      await verifyDownloadedUpdate(downloadedFilePath, update.manifest)
      if (!isCurrentOperation(operation)) {
        return { ...state }
      }

      verifiedDownload = {
        generation: operation.generation,
        filePath: downloadedFilePath,
        manifest: update.manifest,
      }
      setState({
        status: 'downloaded',
        availableVersion: update.manifest.version,
        downloadProgress: 100,
        errorMessage: null,
        canDownload: false,
        canInstall: true,
      })
    } catch (error) {
      await discardDownloadedFile(downloadedFilePath)
      failCurrentOperation(operation, error)
    } finally {
      finishOperation(operation)
    }

    return { ...state }
  }

  const installUpdate = async () => {
    if (
      activeOperation ||
      state.status !== 'downloaded' ||
      !state.canInstall ||
      !verifiedDownload
    ) {
      return { ...state }
    }

    const previousVerifiedDownload = verifiedDownload
    const previousAuthenticatedUpdate = authenticatedUpdate
    const operation = startOperation('install')
    verifiedDownload = {
      ...previousVerifiedDownload,
      generation: operation.generation,
    }
    if (previousAuthenticatedUpdate) {
      transferAuthenticatedUpdate(operation, previousAuthenticatedUpdate)
    }

    try {
      setState({
        status: 'verifying',
        availableVersion: verifiedDownload.manifest.version,
        errorMessage: null,
        canDownload: false,
        canInstall: false,
      })
      await verifyDownloadedUpdate(verifiedDownload.filePath, verifiedDownload.manifest)
      if (!isCurrentOperation(operation) || verifiedDownload.generation !== operation.generation) {
        return { ...state }
      }

      setState({
        status: 'downloaded',
        downloadProgress: 100,
        errorMessage: null,
        canDownload: false,
        canInstall: false,
      })
      autoUpdater.quitAndInstall(false)
    } catch (error) {
      await discardDownloadedFile(previousVerifiedDownload.filePath)
      failCurrentOperation(operation, error)
    } finally {
      finishOperation(operation)
    }

    return { ...state }
  }

  const getState = () => ({ ...state })

  autoUpdater.on('checking-for-update', () => {
    if (!activeOperation || activeOperation.generation !== generation) {
      return
    }

    setState({
      status: 'checking',
      errorMessage: null,
      downloadProgress: null,
      canDownload: false,
      canInstall: false,
    })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    if (!activeOperation || activeOperation.generation !== generation) {
      return
    }

    // L'événement n'est pas une preuve : latest.yml doit encore être confronté au manifeste signé.
    setState({
      status: 'checking',
      availableVersion: info.version,
      errorMessage: null,
      canDownload: false,
      canInstall: false,
    })
  })

  autoUpdater.on('update-not-available', () => {
    if (!activeOperation || activeOperation.generation !== generation) {
      return
    }

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
    if (
      activeOperation?.kind !== 'download' ||
      activeOperation.generation !== generation
    ) {
      return
    }

    setState({
      status: 'downloading',
      downloadProgress: Math.round(progress.percent),
      errorMessage: null,
      canDownload: false,
      canInstall: false,
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateDownloadedEvent) => {
    if (
      activeOperation?.kind !== 'download' ||
      activeOperation.generation !== generation
    ) {
      return
    }

    downloadedEvent = {
      generation,
      filePath: info.downloadedFile,
      version: info.version,
    }
    setState({
      status: 'verifying',
      availableVersion: info.version,
      downloadProgress: 100,
      errorMessage: null,
      canDownload: false,
      canInstall: false,
    })
  })

  autoUpdater.on('error', (error: Error) => {
    if (!enabled) {
      return
    }

    generation += 1
    clearTrustedUpdate()
    setState({
      status: 'error',
      errorMessage: getUserFriendlyErrorMessage(error),
      downloadProgress: null,
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
