import type { Display } from 'electron'
import type { ControlWindowBounds } from '../core/appConfig'
import type { OverlayDisplayInfo, OverlayDisplayPreferences } from '../../shared/types'

type ElectronScreen = {
  getPrimaryDisplay: () => Display
  getAllDisplays: () => Display[]
  getDisplayMatching: (rect: Electron.Rectangle) => Display
}

export const getOverlayDisplays = (screen: ElectronScreen): OverlayDisplayInfo[] => {
  const primaryDisplay = screen.getPrimaryDisplay()
  const primaryDisplayId = String(primaryDisplay.id)

  return screen.getAllDisplays().map((display, index) => ({
    id: String(display.id),
    label: display.id === primaryDisplay.id ? `Écran ${index + 1} (principal)` : `Écran ${index + 1}`,
    isPrimary: String(display.id) === primaryDisplayId,
    bounds: {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
    },
  }))
}

export const getOverlayTargetDisplay = (
  screen: ElectronScreen,
  preferences: OverlayDisplayPreferences,
) => {
  const primaryDisplay = screen.getPrimaryDisplay()

  if (preferences.displayId === 'primary') {
    return primaryDisplay
  }

  return (
    screen.getAllDisplays().find((display) => String(display.id) === preferences.displayId) ??
    primaryDisplay
  )
}

export const getControlWindowBounds = (
  screen: ElectronScreen,
  stored: Partial<ControlWindowBounds>,
): ControlWindowBounds => {
  const width = Number(stored.width)
  const height = Number(stored.height)
  const x = Number(stored.x)
  const y = Number(stored.y)
  const fallback: ControlWindowBounds = {
    width: 500,
    height: 800,
  }

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return fallback
  }

  const bounds: ControlWindowBounds = {
    width: Math.max(500, Math.round(width)),
    height: Math.max(800, Math.round(height)),
  }

  if (Number.isFinite(x) && Number.isFinite(y)) {
    bounds.x = Math.round(x)
    bounds.y = Math.round(y)
  }

  const matchingDisplay = screen.getDisplayMatching({
    x: bounds.x ?? 0,
    y: bounds.y ?? 0,
    width: bounds.width,
    height: bounds.height,
  })

  if (bounds.x === undefined || bounds.y === undefined) {
    return bounds
  }

  const visibleArea = matchingDisplay.workArea
  const hasVisibleCorner =
    bounds.x < visibleArea.x + visibleArea.width &&
    bounds.x + bounds.width > visibleArea.x &&
    bounds.y < visibleArea.y + visibleArea.height &&
    bounds.y + bounds.height > visibleArea.y

  return hasVisibleCorner ? bounds : fallback
}
