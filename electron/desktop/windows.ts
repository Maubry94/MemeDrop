import { BrowserWindow } from 'electron'
import type { Display, Input, Rectangle } from 'electron'
import type { ControlWindowBounds } from '../core/appConfig'

type RendererView = 'overlay' | 'control'

type RendererLoader = {
  loadView: (window: BrowserWindow, view: RendererView) => void
}

type MemeDropWindowsOptions = {
  windowIcon: string
  preloadPath: string
  renderer: RendererLoader
  getAppTitle: () => string
  getOverlayTargetDisplay: () => Display
  getControlWindowBounds: () => ControlWindowBounds
  getShouldStartControlHidden: () => boolean
  setShouldStartControlHidden: (hidden: boolean) => void
  isQuitting: () => boolean
  shouldHideControlOnClose: () => boolean
  onQuitRequest: () => void
  onOverlayLoaded: () => void
  onControlLoaded: () => void
  shouldCaptureShortcutInput: () => boolean
  onShortcutInput: (input: Input) => void
  onControlBoundsChanged: (bounds: Rectangle) => void
}

export const createMemeDropWindows = ({
  windowIcon,
  preloadPath,
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
  onControlBoundsChanged,
}: MemeDropWindowsOptions) => {
  let overlayWindow: BrowserWindow | null = null
  let controlWindow: BrowserWindow | null = null
  let overlayKeepAliveTimer: ReturnType<typeof setInterval> | null = null
  let controlWindowBoundsSaveTimer: ReturnType<typeof setTimeout> | null = null

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

  const createOverlayWindow = () => {
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
        preload: preloadPath,
        webviewTag: true,
      },
    })

    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    overlayWindow.setIgnoreMouseEvents(true)
    keepOverlayAboveFullscreen()
    startOverlayKeepAlive()
    overlayWindow.webContents.on('did-finish-load', () => {
      onOverlayLoaded()
      keepOverlayAboveFullscreen()
    })
    overlayWindow.on('closed', () => {
      overlayWindow = null
      stopOverlayKeepAlive()
    })

    renderer.loadView(overlayWindow, 'overlay')
  }

  const createControlWindow = () => {
    controlWindow = new BrowserWindow({
      ...getControlWindowBounds(),
      minWidth: 500,
      minHeight: 370,
      resizable: true,
      minimizable: true,
      maximizable: false,
      show: !getShouldStartControlHidden(),
      backgroundColor: '#0f172a',
      icon: windowIcon,
      title: getAppTitle(),
      webPreferences: {
        preload: preloadPath,
      },
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
    controlWindow.on('close', (event) => {
      saveControlWindowBounds()

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

  const hasAnyWindow = () => BrowserWindow.getAllWindows().length > 0

  const clearWindowReferences = () => {
    overlayWindow = null
    controlWindow = null
  }

  const dispose = () => {
    stopOverlayKeepAlive()
    if (controlWindowBoundsSaveTimer) {
      clearTimeout(controlWindowBoundsSaveTimer)
      controlWindowBoundsSaveTimer = null
    }
    saveControlWindowBounds()
  }

  return {
    createWindows,
    showControlWindow,
    keepOverlayAboveFullscreen,
    sendToWindows,
    sendToOverlay,
    sendToControl,
    hasAnyWindow,
    clearWindowReferences,
    dispose,
  }
}
