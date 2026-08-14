import type { Display } from 'electron'
import type { ControlWindowBounds } from '../core/appConfig'
import type { OverlayDisplayInfo, OverlayDisplayPreferences } from '../../shared/types'

type ElectronScreen = {
  getPrimaryDisplay: () => Display
  getAllDisplays: () => Display[]
  getDisplayMatching: (rect: Electron.Rectangle) => Display
}

export const CONTROL_WINDOW_DEFAULT_WIDTH = 580
export const CONTROL_WINDOW_DEFAULT_HEIGHT = 820
export const CONTROL_WINDOW_MIN_WIDTH = 580
export const CONTROL_WINDOW_MIN_HEIGHT = 340

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

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
  const storedWidth = toFiniteNumber(stored.width)
  const storedHeight = toFiniteNumber(stored.height)
  const storedX = toFiniteNumber(stored.x)
  const storedY = toFiniteNumber(stored.y)
  const requestedWidth = Math.round(
    storedWidth !== null && storedWidth > 0
      ? storedWidth
      : CONTROL_WINDOW_DEFAULT_WIDTH,
  )
  const requestedHeight = Math.round(
    storedHeight !== null && storedHeight > 0
      ? storedHeight
      : CONTROL_WINDOW_DEFAULT_HEIGHT,
  )
  const hasStoredPosition = storedX !== null && storedY !== null
  const primaryDisplay = screen.getPrimaryDisplay()
  const matchingDisplay = hasStoredPosition
    ? screen.getDisplayMatching({
        x: Math.round(storedX),
        y: Math.round(storedY),
        width: requestedWidth,
        height: requestedHeight,
      })
    : primaryDisplay
  const workArea = matchingDisplay.workArea

  // Electron exposes screen rectangles in DIP. Applying scaleFactor here would
  // move or resize the window twice on mixed-DPI configurations.
  const workAreaX = Math.round(workArea.x)
  const workAreaY = Math.round(workArea.y)
  const workAreaWidth = Math.max(1, Math.round(workArea.width))
  const workAreaHeight = Math.max(1, Math.round(workArea.height))
  const minimumWidth = Math.min(CONTROL_WINDOW_MIN_WIDTH, workAreaWidth)
  const minimumHeight = Math.min(CONTROL_WINDOW_MIN_HEIGHT, workAreaHeight)
  const width = clamp(requestedWidth, minimumWidth, workAreaWidth)
  const height = clamp(requestedHeight, minimumHeight, workAreaHeight)
  const centeredX = workAreaX + Math.floor((workAreaWidth - width) / 2)
  const centeredY = workAreaY + Math.floor((workAreaHeight - height) / 2)

  return {
    width,
    height,
    x: hasStoredPosition
      ? clamp(Math.round(storedX), workAreaX, workAreaX + workAreaWidth - width)
      : centeredX,
    y: hasStoredPosition
      ? clamp(Math.round(storedY), workAreaY, workAreaY + workAreaHeight - height)
      : centeredY,
  }
}
