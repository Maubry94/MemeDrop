import assert from 'node:assert/strict'
import test from 'node:test'
import type { AppUpdateState, AppVersionInfo } from '../../shared/types.ts'
import { getAppUpdatePresentation } from './updatePresentation.ts'

const versionInfo: AppVersionInfo = {
  currentVersion: '3.0.9',
  latestVersion: '3.1.0',
  updateAvailable: true,
  releaseUrl: 'https://example.test/release',
}

const createState = (overrides: Partial<AppUpdateState> = {}): AppUpdateState => ({
  status: 'idle',
  currentVersion: '3.0.9',
  availableVersion: null,
  downloadProgress: null,
  errorMessage: null,
  canCheck: true,
  canDownload: false,
  canInstall: false,
  ...overrides,
})

test('presents an available update with its supported action', () => {
  const presentation = getAppUpdatePresentation(
    createState({ status: 'available', availableVersion: '3.1.0', canDownload: true }),
    versionInfo,
  )

  assert.equal(presentation.title, 'Version 3.1.0 disponible')
  assert.equal(presentation.action, 'download')
  assert.equal(presentation.showBanner, true)
})

test('clamps download progress to a valid percentage', () => {
  const presentation = getAppUpdatePresentation(
    createState({ status: 'downloading', downloadProgress: 145 }),
    versionInfo,
  )

  assert.equal(presentation.progress, 100)
  assert.equal(presentation.busy, true)
})

test('uses user-facing copy while preparing a downloaded update', () => {
  const presentation = getAppUpdatePresentation(
    createState({ status: 'verifying' }),
    versionInfo,
  )

  assert.equal(presentation.title, 'Préparation de la mise à jour…')
  assert.doesNotMatch(presentation.message, /signature|cryptograph/i)
})

test('keeps an up-to-date result in preferences without a persistent banner', () => {
  const presentation = getAppUpdatePresentation(
    createState({ status: 'not-available' }),
    { ...versionInfo, latestVersion: '3.0.9', updateAvailable: false },
  )

  assert.equal(presentation.tone, 'success')
  assert.equal(presentation.action, 'check')
  assert.equal(presentation.showBanner, false)
})

test('does not expose raw updater errors in the interface', () => {
  const presentation = getAppUpdatePresentation(
    createState({
      status: 'error',
      errorMessage: 'EPERM C:\\Users\\name\\AppData\\Local\\secret.tmp',
    }),
    versionInfo,
  )

  assert.doesNotMatch(presentation.message, /EPERM|AppData|secret/)
  assert.equal(presentation.tone, 'danger')
})

test('keeps a disabled local build free of updater warnings', () => {
  const presentation = getAppUpdatePresentation(
    createState({
      status: 'disabled',
      errorMessage: "L'auto-update est désactivé dans ce build local.",
      canCheck: false,
    }),
    versionInfo,
  )

  assert.equal(presentation.title, 'Version installée')
  assert.doesNotMatch(presentation.message, /désactivé|auto-update/i)
  assert.equal(presentation.action, null)
})
