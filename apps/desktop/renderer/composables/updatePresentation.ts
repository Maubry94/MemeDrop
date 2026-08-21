import type { AppUpdateState, AppVersionInfo } from '../../shared/types'

export type AppUpdateAction = 'check' | 'download' | 'install'
export type AppUpdateTone = 'neutral' | 'info' | 'success' | 'danger'

export type AppUpdatePresentation = {
  title: string
  message: string
  tone: AppUpdateTone
  action: AppUpdateAction | null
  actionLabel: string | null
  busy: boolean
  progress: number | null
  showBanner: boolean
}

const normalizedVersion = (version: string | null | undefined) => version?.trim() || null

export const getAppUpdatePresentation = (
  state: AppUpdateState,
  versionInfo: AppVersionInfo,
): AppUpdatePresentation => {
  const currentVersion = normalizedVersion(versionInfo.currentVersion)
    ?? normalizedVersion(state.currentVersion)
    ?? 'inconnue'
  const availableVersion = normalizedVersion(state.availableVersion)
    ?? normalizedVersion(versionInfo.latestVersion)

  switch (state.status) {
    case 'disabled':
      return {
        title: 'Version installée',
        message: `MemeDrop ${currentVersion}.`,
        tone: 'neutral',
        action: null,
        actionLabel: null,
        busy: false,
        progress: null,
        showBanner: false,
      }
    case 'checking':
      return {
        title: 'Recherche d’une mise à jour…',
        message: `Version installée : ${currentVersion}.`,
        tone: 'info',
        action: null,
        actionLabel: null,
        busy: true,
        progress: null,
        showBanner: true,
      }
    case 'available':
      return {
        title: availableVersion ? `Version ${availableVersion} disponible` : 'Nouvelle version disponible',
        message: 'La mise à jour peut être téléchargée directement depuis MemeDrop.',
        tone: 'info',
        action: state.canDownload ? 'download' : null,
        actionLabel: state.canDownload ? 'Télécharger' : null,
        busy: false,
        progress: null,
        showBanner: true,
      }
    case 'downloading': {
      const progress = Math.min(100, Math.max(0, Math.round(state.downloadProgress ?? 0)))
      return {
        title: availableVersion ? `Téléchargement de la version ${availableVersion}` : 'Téléchargement en cours',
        message: `${progress} % téléchargés.`,
        tone: 'info',
        action: null,
        actionLabel: null,
        busy: true,
        progress,
        showBanner: true,
      }
    }
    case 'verifying':
      return {
        title: 'Préparation de la mise à jour…',
        message: 'MemeDrop prépare les fichiers téléchargés.',
        tone: 'info',
        action: null,
        actionLabel: null,
        busy: true,
        progress: null,
        showBanner: true,
      }
    case 'downloaded':
      return {
        title: 'Mise à jour prête',
        message: availableVersion
          ? `La version ${availableVersion} est prête à être installée.`
          : 'La nouvelle version est prête à être installée.',
        tone: 'success',
        action: state.canInstall ? 'install' : null,
        actionLabel: state.canInstall ? 'Redémarrer et installer' : null,
        busy: false,
        progress: null,
        showBanner: true,
      }
    case 'error':
      return {
        title: 'Mise à jour indisponible',
        message: 'La mise à jour n’a pas pu être récupérée. Réessaie dans quelques instants.',
        tone: 'danger',
        action: state.canCheck ? 'check' : null,
        actionLabel: state.canCheck ? 'Réessayer' : null,
        busy: false,
        progress: null,
        showBanner: true,
      }
    case 'not-available':
      return {
        title: 'MemeDrop est à jour',
        message: `Version installée : ${currentVersion}.`,
        tone: 'success',
        action: state.canCheck ? 'check' : null,
        actionLabel: state.canCheck ? 'Rechercher à nouveau' : null,
        busy: false,
        progress: null,
        showBanner: false,
      }
    case 'idle':
    default:
      if (versionInfo.updateAvailable) {
        return {
          title: availableVersion ? `Version ${availableVersion} disponible` : 'Nouvelle version disponible',
          message: 'Lance la recherche pour télécharger cette mise à jour.',
          tone: 'info',
          action: state.canCheck ? 'check' : null,
          actionLabel: state.canCheck ? 'Rechercher la mise à jour' : null,
          busy: false,
          progress: null,
          showBanner: true,
        }
      }

      return {
        title: 'Version installée',
        message: `MemeDrop ${currentVersion}.`,
        tone: 'neutral',
        action: state.canCheck ? 'check' : null,
        actionLabel: state.canCheck ? 'Rechercher une mise à jour' : null,
        busy: false,
        progress: null,
        showBanner: false,
      }
  }
}
