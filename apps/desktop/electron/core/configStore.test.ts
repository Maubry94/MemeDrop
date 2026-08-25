import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import type { ControlPanelSectionId } from '../../shared/types.ts'
import {
  getAppConfigPath,
  readAppConfigFile,
  writeAppConfigFile,
  type AppConfigFile,
} from './appConfig.ts'
import {
  createConfigStore,
  normalizeOverlayDisplayPreferences,
} from './configStore.ts'

const createTemporaryUserData = (context: TestContext) => {
  const userDataPath = mkdtempSync(path.join(tmpdir(), 'memedrop-config-store-'))
  context.after(() => rmSync(userDataPath, { recursive: true, force: true }))
  return userDataPath
}

test('uses stable defaults for missing, legacy, and invalid section state', (context) => {
  const userDataPath = createTemporaryUserData(context)
  const store = createConfigStore(userDataPath)

  assert.deepEqual(store.getControlPanelSectionState(), {
    dropReception: true,
    overlayAppearance: true,
    accountAndServer: false,
  })

  writeAppConfigFile(getAppConfigPath(userDataPath), {
    controlPanel: {
      dropReception: 'invalid',
      overlayAppearance: false,
      accountAndServer: 1,
    },
  } as unknown as AppConfigFile)

  assert.deepEqual(store.getControlPanelSectionState(), {
    dropReception: true,
    overlayAppearance: false,
    accountAndServer: false,
  })
})

test('persists each section independently and preserves the rest of the config', (context) => {
  const userDataPath = createTemporaryUserData(context)
  const configPath = getAppConfigPath(userDataPath)
  writeAppConfigFile(configPath, {
    discord: { legacyValue: 'preserved' },
    app: { minimizeToTray: true, openAtLogin: false },
    shortcuts: { toggleDrops: 'Control+Shift+D' },
    controlPanel: {
      dropReception: true,
      overlayAppearance: true,
      accountAndServer: false,
    },
  })

  const store = createConfigStore(userDataPath)
  assert.deepEqual(store.setControlPanelSectionOpen('dropReception', false), {
    dropReception: false,
    overlayAppearance: true,
    accountAndServer: false,
  })
  assert.deepEqual(store.setControlPanelSectionOpen('accountAndServer', true), {
    dropReception: false,
    overlayAppearance: true,
    accountAndServer: true,
  })

  const reloadedStore = createConfigStore(userDataPath)
  assert.deepEqual(reloadedStore.getControlPanelSectionState(), {
    dropReception: false,
    overlayAppearance: true,
    accountAndServer: true,
  })

  const stored = readAppConfigFile(configPath)
  assert.deepEqual(stored.discord, { legacyValue: 'preserved' })
  assert.deepEqual(stored.app, { minimizeToTray: true, openAtLogin: false })
  assert.deepEqual(stored.shortcuts, { toggleDrops: 'Control+Shift+D' })
})

test('rejects unknown section identifiers and non-boolean values', (context) => {
  const userDataPath = createTemporaryUserData(context)
  const store = createConfigStore(userDataPath)

  assert.throws(
    () => store.setControlPanelSectionOpen('unknown' as ControlPanelSectionId, true),
    /invalide/,
  )
  assert.throws(
    () => store.setControlPanelSectionOpen('dropReception', 'false' as unknown as boolean),
    /invalide/,
  )
})

test('normalizes overlay display preferences at the IPC and storage boundary', () => {
  assert.deepEqual(
    normalizeOverlayDisplayPreferences({
      displayId: '../invalid',
      position: 'outside' as never,
      volume: 200,
      size: Number.NaN,
      customX: -10,
      customY: 110,
      customAnchor: 'custom' as never,
    }),
    {
      displayId: 'primary',
      position: 'full',
      volume: 100,
      size: 100,
      customX: 0,
      customY: 100,
      customAnchor: 'full',
    },
  )

  assert.deepEqual(
    normalizeOverlayDisplayPreferences({
      displayId: '-123456',
      position: 'custom',
      volume: 35,
      size: 125,
      customX: 17,
      customY: 82,
      customAnchor: 'bottom-right',
    }),
    {
      displayId: '-123456',
      position: 'custom',
      volume: 35,
      size: 125,
      customX: 17,
      customY: 82,
      customAnchor: 'bottom-right',
    },
  )
})
