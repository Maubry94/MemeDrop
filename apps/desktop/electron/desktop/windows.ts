import { BrowserWindow, session } from 'electron'
import type { Cookie, Display, Input, Rectangle, WebContents } from 'electron'
import type { ControlWindowBounds } from '../core/appConfig'
import type { TikTokVolumeApplicationResult } from '../../shared/preloadApi'
import {
  CONTROL_WINDOW_MIN_HEIGHT,
  CONTROL_WINDOW_MIN_WIDTH,
} from './displays'
import { applyTikTokPlayerVolume } from './tiktokVolume'

type RendererView = 'overlay' | 'control'

const TIKTOK_URL = 'https://www.tiktok.com/'
const TIKTOK_CONSENT_COOKIE_NAME = 'cookie-consent'
const TIKTOK_CONSENT_COOKIE_LIFETIME_SECONDS = 365 * 24 * 60 * 60
// Format actuellement produit par le bouton TikTok « Refuser les cookies optionnels ».
const TIKTOK_OPTIONAL_COOKIE_PREFERENCES = {
  optional: false,
  ga: false,
  af: false,
  fbp: false,
  lip: false,
  bing: false,
  ttads: false,
  reddit: false,
  hubspot: false,
  version: 'v10',
}
const TIKTOK_DECLINED_OPTIONAL_COOKIES = encodeURIComponent(
  JSON.stringify(TIKTOK_OPTIONAL_COOKIE_PREFERENCES),
)
  .replace(/^%7B/, '{')
  .replace(/%7D$/, '}')
  .replace(/%3A/g, ':')

const isTikTokOptionalCookieRefusal = (cookie: Cookie) =>
  cookie.name === TIKTOK_CONSENT_COOKIE_NAME &&
  cookie.value === TIKTOK_DECLINED_OPTIONAL_COOKIES &&
  cookie.domain === '.tiktok.com' &&
  cookie.path === '/' &&
  cookie.secure &&
  !cookie.httpOnly &&
  cookie.sameSite === 'no_restriction' &&
  !cookie.session

type RendererLoader = {
  loadView: (window: BrowserWindow, view: RendererView) => void
}

type MemeDropWindowsOptions = {
  windowIcon: string
  controlPreloadPath: string
  overlayPreloadPath: string
  renderer: RendererLoader
  getAppTitle: () => string
  getOverlayTargetDisplay: () => Display
  getControlWindowBounds: (bounds?: Partial<ControlWindowBounds>) => ControlWindowBounds
  getShouldStartControlHidden: () => boolean
  setShouldStartControlHidden: (hidden: boolean) => void
  isQuitting: () => boolean
  shouldHideControlOnClose: () => boolean
  onQuitRequest: () => void
  onOverlayLoaded: () => void
  onControlLoaded: () => void
  shouldCaptureShortcutInput: () => boolean
  onShortcutInput: (input: Input) => void
  onControlWindowDeactivated: () => void
  onControlBoundsChanged: (bounds: Rectangle) => void
}

export const createMemeDropWindows = ({
  windowIcon,
  controlPreloadPath,
  overlayPreloadPath,
  renderer,
  getAppTitle,
  getOverlayTargetDisplay,
  getControlWindowBounds,
  getShouldStartControlHidden,
  setShouldStartControlHidden,
  isQuitting,
  shouldHideControlOnClose,
  onQuitRequest,
  onOverlayLoaded,
  onControlLoaded,
  shouldCaptureShortcutInput,
  onShortcutInput,
  onControlWindowDeactivated,
  onControlBoundsChanged,
}: MemeDropWindowsOptions) => {
  let overlayWindow: BrowserWindow | null = null
  let controlWindow: BrowserWindow | null = null
  let overlayKeepAliveTimer: ReturnType<typeof setInterval> | null = null
  let controlWindowBoundsSaveTimer: ReturnType<typeof setTimeout> | null = null
  let tiktokAudioGeneration = 0
  let tiktokAudioGate: { dropId: string; generation: number } | null = null
  let isRendererSessionConfigured = false
  let rendererSessionPreparation: Promise<void> | null = null

  const configureRendererSession = () => {
    if (isRendererSessionConfigured) {
      return
    }

    const rendererSession = session.defaultSession
    rendererSession.setPermissionCheckHandler(() => false)
    rendererSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false)
    })
    rendererSession.setDevicePermissionHandler(() => false)
    rendererSession.setDisplayMediaRequestHandler((_request, callback) => {
      callback({})
    })
    rendererSession.on('will-download', (event) => {
      event.preventDefault()
    })

    isRendererSessionConfigured = true
  }

  const ensureTikTokCookieConsent = async () => {
    const rendererCookies = session.defaultSession.cookies
    const existingConsent = await rendererCookies.get({
      url: TIKTOK_URL,
      name: TIKTOK_CONSENT_COOKIE_NAME,
    })

    if (existingConsent.some(isTikTokOptionalCookieRefusal)) {
      return
    }

    await rendererCookies.set({
      url: TIKTOK_URL,
      name: TIKTOK_CONSENT_COOKIE_NAME,
      value: TIKTOK_DECLINED_OPTIONAL_COOKIES,
      domain: '.tiktok.com',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'no_restriction',
      expirationDate:
        Math.floor(Date.now() / 1000) + TIKTOK_CONSENT_COOKIE_LIFETIME_SECONDS,
    })

    const storedConsent = await rendererCookies.get({
      url: TIKTOK_URL,
      name: TIKTOK_CONSENT_COOKIE_NAME,
    })
    if (!storedConsent.some(isTikTokOptionalCookieRefusal)) {
      throw new Error('Le refus des cookies TikTok optionnels n’a pas été enregistré.')
    }

    await rendererCookies.flushStore()
  }

  const prepareRendererSession = () => {
    configureRendererSession()
    rendererSessionPreparation ??= ensureTikTokCookieConsent().catch((error: unknown) => {
      console.warn(
        'Impossible de mémoriser le refus des cookies TikTok optionnels :',
        error,
      )
    })
    return rendererSessionPreparation
  }

  const hardenLocalRenderer = (window: BrowserWindow) => {
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => {
      event.preventDefault()
    })
    window.webContents.on('will-redirect', (event) => {
      if (event.isMainFrame) {
        event.preventDefault()
      }
    })
  }

  const keepOverlayAboveFullscreen = () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return
    }

    overlayWindow.setBounds(getOverlayTargetDisplay().bounds)
    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    overlayWindow.showInactive()
    overlayWindow.moveTop()
  }

  const startOverlayKeepAlive = () => {
    if (overlayKeepAliveTimer) {
      return
    }

    overlayKeepAliveTimer = setInterval(keepOverlayAboveFullscreen, 1000)
  }

  const stopOverlayKeepAlive = () => {
    if (!overlayKeepAliveTimer) {
      return
    }

    clearInterval(overlayKeepAliveTimer)
    overlayKeepAliveTimer = null
  }

  const unavailableTikTokVolume = (): TikTokVolumeApplicationResult => ({
    applied: false,
    effectiveVolume: null,
    usedFallback: false,
  })

  const beginTikTokAudio = (dropId: string) => {
    const generation = ++tiktokAudioGeneration
    tiktokAudioGate = { dropId, generation }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.setAudioMuted(true)
    }
    return generation
  }

  const releaseTikTokAudio = (dropId?: string) => {
    if (!tiktokAudioGate || (dropId && tiktokAudioGate.dropId !== dropId)) {
      return false
    }

    tiktokAudioGeneration += 1
    tiktokAudioGate = null
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.setAudioMuted(false)
    }
    return true
  }

  const suspendTikTokAudio = (dropId?: string) => {
    if (!tiktokAudioGate || (dropId && tiktokAudioGate.dropId !== dropId)) {
      return false
    }

    const generation = ++tiktokAudioGeneration
    tiktokAudioGate = { dropId: tiktokAudioGate.dropId, generation }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.setAudioMuted(true)
    }
    return true
  }

  const saveControlWindowBounds = () => {
    if (!controlWindow || controlWindow.isDestroyed() || controlWindow.isMinimized()) {
      return
    }

    onControlBoundsChanged(controlWindow.getNormalBounds())
  }

  const scheduleControlWindowBoundsSave = () => {
    if (controlWindowBoundsSaveTimer) {
      clearTimeout(controlWindowBoundsSaveTimer)
    }

    controlWindowBoundsSaveTimer = setTimeout(() => {
      controlWindowBoundsSaveTimer = null
      saveControlWindowBounds()
    }, 400)
  }

  const ensureControlWindowVisible = () => {
    if (!controlWindow || controlWindow.isDestroyed()) {
      return
    }

    const currentBounds = controlWindow.getNormalBounds()
    const nextBounds = getControlWindowBounds(currentBounds)
    const normalizedBounds: Rectangle = {
      x: nextBounds.x ?? currentBounds.x,
      y: nextBounds.y ?? currentBounds.y,
      width: nextBounds.width,
      height: nextBounds.height,
    }

    controlWindow.setMinimumSize(
      Math.min(CONTROL_WINDOW_MIN_WIDTH, normalizedBounds.width),
      Math.min(CONTROL_WINDOW_MIN_HEIGHT, normalizedBounds.height),
    )

    if (
      currentBounds.x !== normalizedBounds.x ||
      currentBounds.y !== normalizedBounds.y ||
      currentBounds.width !== normalizedBounds.width ||
      currentBounds.height !== normalizedBounds.height
    ) {
      controlWindow.setBounds(normalizedBounds)
    }
  }

  const createOverlayWindow = () => {
    configureRendererSession()

    const overlayDisplay = getOverlayTargetDisplay()
    const { width, height, x, y } = overlayDisplay.bounds
    overlayWindow = new BrowserWindow({
      width,
      height,
      x,
      y,
      icon: windowIcon,
      frame: false,
      transparent: true,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      fullscreenable: false,
      focusable: false,
      webPreferences: {
        allowRunningInsecureContent: false,
        contextIsolation: true,
        navigateOnDragDrop: false,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        nodeIntegrationInWorker: false,
        preload: overlayPreloadPath,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
      },
    })

    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    overlayWindow.setIgnoreMouseEvents(true)
    hardenLocalRenderer(overlayWindow)
    keepOverlayAboveFullscreen()
    startOverlayKeepAlive()
    overlayWindow.webContents.on(
      'did-start-navigation',
      (_event, _url, _isInPlace, isMainFrame) => {
        if (isMainFrame && tiktokAudioGate) {
          overlayWindow?.webContents.setAudioMuted(true)
        }
      },
    )
    overlayWindow.webContents.on('did-finish-load', () => {
      overlayWindow?.webContents.setAudioMuted(Boolean(tiktokAudioGate))
      onOverlayLoaded()
      keepOverlayAboveFullscreen()
    })
    overlayWindow.on('closed', () => {
      tiktokAudioGeneration += 1
      tiktokAudioGate = null
      overlayWindow = null
      stopOverlayKeepAlive()
    })

    renderer.loadView(overlayWindow, 'overlay')
  }

  const createControlWindow = () => {
    configureRendererSession()
    const initialBounds = getControlWindowBounds()
    controlWindow = new BrowserWindow({
      ...initialBounds,
      minWidth: Math.min(CONTROL_WINDOW_MIN_WIDTH, initialBounds.width),
      minHeight: Math.min(CONTROL_WINDOW_MIN_HEIGHT, initialBounds.height),
      resizable: true,
      minimizable: true,
      maximizable: false,
      show: !getShouldStartControlHidden(),
      backgroundColor: '#0f172a',
      icon: windowIcon,
      title: getAppTitle(),
      webPreferences: {
        allowRunningInsecureContent: false,
        contextIsolation: true,
        navigateOnDragDrop: false,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        nodeIntegrationInWorker: false,
        preload: controlPreloadPath,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
      },
    })

    hardenLocalRenderer(controlWindow)
    controlWindow.on('page-title-updated', (event) => {
      event.preventDefault()
      controlWindow?.setTitle(getAppTitle())
    })
    controlWindow.webContents.on('did-finish-load', () => {
      controlWindow?.setTitle(getAppTitle())
      onControlLoaded()
    })
    controlWindow.webContents.on('before-input-event', (event, input) => {
      if (!shouldCaptureShortcutInput()) {
        return
      }

      event.preventDefault()
      onShortcutInput(input)
    })
    controlWindow.on('blur', onControlWindowDeactivated)
    controlWindow.on('hide', onControlWindowDeactivated)
    controlWindow.on('close', (event) => {
      saveControlWindowBounds()
      onControlWindowDeactivated()

      if (isQuitting()) {
        return
      }

      if (shouldHideControlOnClose()) {
        event.preventDefault()
        controlWindow?.hide()
        return
      }

      onQuitRequest()
    })
    controlWindow.on('closed', () => {
      onControlWindowDeactivated()
      controlWindow = null
    })
    controlWindow.on('resize', scheduleControlWindowBoundsSave)
    controlWindow.on('move', scheduleControlWindowBoundsSave)

    renderer.loadView(controlWindow, 'control')
    setShouldStartControlHidden(false)
  }

  const createWindows = () => {
    createOverlayWindow()
    createControlWindow()
  }

  const showControlWindow = () => {
    if (!controlWindow || controlWindow.isDestroyed()) {
      createControlWindow()
      return
    }

    if (controlWindow.isMinimized()) {
      controlWindow.restore()
    }

    ensureControlWindowVisible()
    controlWindow.show()
    controlWindow.focus()
  }

  const sendToWindows = (channel: string, payload: unknown) => {
    overlayWindow?.webContents.send(channel, payload)
    controlWindow?.webContents.send(channel, payload)
  }

  const sendToOverlay = (channel: string, payload: unknown) => {
    overlayWindow?.webContents.send(channel, payload)
  }

  const sendToControl = (channel: string, payload: unknown) => {
    controlWindow?.webContents.send(channel, payload)
  }

  const applyTikTokVolume = async (
    dropId: string,
    videoId: string,
    volume: number,
  ): Promise<TikTokVolumeApplicationResult> => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return unavailableTikTokVolume()
    }

    const targetWindow = overlayWindow
    const generation = beginTikTokAudio(dropId)
    const result = await applyTikTokPlayerVolume(
      () => {
        if (
          targetWindow.isDestroyed() ||
          tiktokAudioGate?.dropId !== dropId ||
          tiktokAudioGate.generation !== generation
        ) {
          return []
        }
        return targetWindow.webContents.mainFrame.framesInSubtree
      },
      videoId,
      volume,
      generation,
    )

    if (
      targetWindow.isDestroyed() ||
      tiktokAudioGate?.dropId !== dropId ||
      tiktokAudioGate.generation !== generation
    ) {
      return unavailableTikTokVolume()
    }

    targetWindow.webContents.setAudioMuted(
      !result.applied || result.effectiveVolume === null || result.effectiveVolume === 0,
    )
    return result
  }

  const isOverlaySender = (sender: WebContents) => overlayWindow?.webContents === sender

  const isControlSender = (sender: WebContents) => controlWindow?.webContents === sender

  const hasAnyWindow = () => BrowserWindow.getAllWindows().length > 0

  const clearWindowReferences = () => {
    tiktokAudioGeneration += 1
    tiktokAudioGate = null
    overlayWindow = null
    controlWindow = null
  }

  const dispose = () => {
    stopOverlayKeepAlive()
    releaseTikTokAudio()
    if (controlWindowBoundsSaveTimer) {
      clearTimeout(controlWindowBoundsSaveTimer)
      controlWindowBoundsSaveTimer = null
    }
    saveControlWindowBounds()
  }

  return {
    prepareRendererSession,
    createWindows,
    showControlWindow,
    ensureControlWindowVisible,
    keepOverlayAboveFullscreen,
    sendToWindows,
    sendToOverlay,
    sendToControl,
    beginTikTokAudio,
    applyTikTokVolume,
    suspendTikTokAudio,
    releaseTikTokAudio,
    isOverlaySender,
    isControlSender,
    hasAnyWindow,
    clearWindowReferences,
    dispose,
  }
}
