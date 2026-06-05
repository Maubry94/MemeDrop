import { globalShortcut, type Input } from 'electron'
import type { ShortcutActionId, ShortcutConfig, ShortcutStatus } from '../../shared/types'

export const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  {
    action: 'toggleDrops',
    accelerator: 'CommandOrControl+Shift+D',
  },
  {
    action: 'skipDrop',
    accelerator: 'CommandOrControl+Shift+S',
  },
  {
    action: 'toggleOwnDrops',
    accelerator: 'CommandOrControl+Shift+M',
  },
  {
    action: 'stopGlobalDrop',
    accelerator: 'CommandOrControl+Shift+X',
  },
]

export const SHORTCUT_LABELS: Record<ShortcutActionId, string> = {
  toggleDrops: 'Activer/désactiver les drops',
  skipDrop: 'Masquer le drop actuel',
  toggleOwnDrops: 'Afficher/masquer mes drops',
  stopGlobalDrop: 'Stopper le drop envoyé',
}

export const normalizeShortcutConfigs = (
  shortcuts: Partial<Record<ShortcutActionId, string>> = {},
): ShortcutConfig[] =>
  DEFAULT_SHORTCUTS.map((shortcut) => ({
    action: shortcut.action,
    accelerator: shortcuts[shortcut.action]?.trim() || shortcut.accelerator,
  }))

export const getShortcutAcceleratorPart = (input: Input): string | null => {
  if (/^[a-z]$/i.test(input.key)) return input.key.toUpperCase()
  if (/^[0-9]$/.test(input.key)) return input.key
  if (/^F\d{1,2}$/i.test(input.key)) return input.key.toUpperCase()

  const specialKeys: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Space: 'Space',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Escape: 'Escape',
  }

  return specialKeys[input.key] ?? null
}

type ShortcutActionHandlers = Record<ShortcutActionId, () => void>

type ShortcutManagerOptions = {
  loadShortcuts: () => Partial<Record<ShortcutActionId, string>> | undefined
  saveShortcuts: (shortcuts: ShortcutConfig[]) => void
  getActionHandlers: () => ShortcutActionHandlers
  onStatusChanged: (status: ShortcutStatus[]) => void
  onConfigsChanged: (shortcuts: ShortcutConfig[]) => void
  onCaptureCancelled: () => void
}

export const createShortcutManager = ({
  loadShortcuts,
  saveShortcuts,
  getActionHandlers,
  onStatusChanged,
  onConfigsChanged,
  onCaptureCancelled,
}: ShortcutManagerOptions) => {
  let shortcutConfigs: ShortcutConfig[] = normalizeShortcutConfigs()
  let shortcutStatus: ShortcutStatus[] = []
  let shortcutCaptureAction: ShortcutActionId | null = null

  const getShortcutConfigs = (): ShortcutConfig[] =>
    shortcutConfigs.map((shortcut) => ({ ...shortcut }))

  const getShortcutStatus = (): ShortcutStatus[] =>
    shortcutStatus.map((shortcut) => ({ ...shortcut }))

  const saveShortcutConfigs = (shortcuts: ShortcutConfig[]) => {
    const normalizedShortcuts = normalizeShortcutConfigs(
      Object.fromEntries(
        shortcuts.map((shortcut) => [shortcut.action, shortcut.accelerator]),
      ) as Partial<Record<ShortcutActionId, string>>,
    )

    shortcutConfigs = normalizedShortcuts
    saveShortcuts(normalizedShortcuts)

    return getShortcutConfigs()
  }

  const registerGlobalShortcuts = () => {
    globalShortcut.unregisterAll()

    const shortcutHandlers = getActionHandlers()
    shortcutStatus = shortcutConfigs.map((shortcut) => ({
      ...shortcut,
      label: SHORTCUT_LABELS[shortcut.action],
      registered: globalShortcut.register(shortcut.accelerator, shortcutHandlers[shortcut.action]),
    }))

    for (const shortcut of shortcutStatus) {
      if (!shortcut.registered) {
        console.warn(`Raccourci non enregistré: ${shortcut.accelerator}`)
      }
    }

    onStatusChanged(getShortcutStatus())
  }

  const loadShortcutConfigs = () => {
    shortcutConfigs = normalizeShortcutConfigs(loadShortcuts())
  }

  const setShortcutCaptureMode = (enabled: boolean) => {
    shortcutCaptureAction = null
    if (enabled) {
      globalShortcut.unregisterAll()
      return
    }

    registerGlobalShortcuts()
  }

  const captureShortcutInput = (input: Input) => {
    if (!shortcutCaptureAction || input.type !== 'keyDown') {
      return
    }

    const key = getShortcutAcceleratorPart(input)
    if (!key) {
      return
    }

    if (key === 'Escape') {
      shortcutCaptureAction = null
      registerGlobalShortcuts()
      onCaptureCancelled()
      return
    }

    const modifiers: string[] = []
    if (input.control || input.meta) modifiers.push('CommandOrControl')
    if (input.alt) modifiers.push('Alt')
    if (input.shift) modifiers.push('Shift')

    if (!modifiers.length && !key.startsWith('F')) {
      return
    }

    const action = shortcutCaptureAction
    const accelerator = [...modifiers, key].join('+')
    const savedShortcuts = setShortcutConfigs(
      shortcutConfigs.map((shortcut) =>
        shortcut.action === action ? { ...shortcut, accelerator } : shortcut,
      ),
    )

    shortcutCaptureAction = null
    onConfigsChanged(savedShortcuts)
  }

  const startShortcutCapture = (action: ShortcutActionId) => {
    if (!SHORTCUT_LABELS[action]) {
      return getShortcutConfigs()
    }

    shortcutCaptureAction = action
    globalShortcut.unregisterAll()
    return getShortcutConfigs()
  }

  const setShortcutConfigs = (shortcuts: ShortcutConfig[]) => {
    const savedShortcuts = saveShortcutConfigs(shortcuts)
    registerGlobalShortcuts()
    return savedShortcuts
  }

  const resetShortcutConfigs = () => {
    const shortcuts = saveShortcutConfigs(DEFAULT_SHORTCUTS)
    registerGlobalShortcuts()
    return shortcuts
  }

  const isCapturingShortcut = () => Boolean(shortcutCaptureAction)

  const dispose = () => {
    globalShortcut.unregisterAll()
  }

  return {
    loadShortcutConfigs,
    getShortcutConfigs,
    getShortcutStatus,
    registerGlobalShortcuts,
    setShortcutCaptureMode,
    captureShortcutInput,
    startShortcutCapture,
    setShortcutConfigs,
    resetShortcutConfigs,
    isCapturingShortcut,
    dispose,
  }
}
