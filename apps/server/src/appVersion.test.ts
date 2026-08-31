import assert from 'node:assert/strict'
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test, { type TestContext } from 'node:test'
import {
  createLatestAppVersionProvider,
  parseLatestAppVersion,
  readBundledAppVersion,
} from './appVersion.js'

const createTemporaryDirectory = async (context: TestContext) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'memedrop-version-'))
  context.after(async () => {
    await rm(directory, { recursive: true, force: true })
  })
  return directory
}

const waitFor = async (predicate: () => boolean) => {
  const deadline = Date.now() + 1_000
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('La version attendue n’a pas été détectée à temps.')
    }
    await delay(10)
  }
}

test('latest.yml accepts supported scalar forms and strict semantic versions', () => {
  assert.equal(parseLatestAppVersion('version: 4.0.2\nfiles: []\n'), '4.0.2')
  assert.equal(parseLatestAppVersion('\uFEFFversion: "4.1.0-beta.2+win"\r\n'), '4.1.0-beta.2+win')
  assert.equal(parseLatestAppVersion("version: '5.0.0'\n"), '5.0.0')

  assert.throws(() => parseLatestAppVersion('files:\n  version: 4.0.2\n'))
  assert.throws(() => parseLatestAppVersion('version: 4.0.2\nversion: 4.0.3\n'))
  assert.throws(() => parseLatestAppVersion('version: 04.0.2\n'))
  assert.throws(() => parseLatestAppVersion('version: 4.0.2 # latest\n'))
})

test('bundled app metadata remains a validated fallback', async (context) => {
  const directory = await createTemporaryDirectory(context)
  const metadataPath = path.join(directory, 'app-version.json')
  await writeFile(metadataPath, '{"latestAppVersion":"4.0.1"}\n', 'utf8')

  assert.equal(await readBundledAppVersion(metadataPath), '4.0.1')

  await writeFile(metadataPath, '{"latestAppVersion":"not-a-version"}\n', 'utf8')
  await assert.rejects(readBundledAppVersion(metadataPath))
})

test('runtime app version refreshes without restart and keeps the last valid value', async (context) => {
  const directory = await createTemporaryDirectory(context)
  const metadataPath = path.join(directory, 'latest.yml')
  const warnings: string[] = []
  const provider = await createLatestAppVersionProvider({
    updatesDirectory: directory,
    fallbackVersion: '4.0.1',
    refreshIntervalMs: 0,
    logger: {
      warn: (message) => warnings.push(String(message)),
    },
  })
  context.after(() => provider.dispose())

  assert.equal(provider.getLatestAppVersion(), '4.0.1')
  assert.equal(warnings.length, 1)

  await writeFile(metadataPath, 'version: 4.0.2\n', 'utf8')
  await provider.refresh()
  assert.equal(provider.getLatestAppVersion(), '4.0.2')

  await writeFile(metadataPath, 'version: incomplete\n', 'utf8')
  await provider.refresh()
  await provider.refresh()
  assert.equal(provider.getLatestAppVersion(), '4.0.2')
  assert.equal(warnings.length, 2)

  await unlink(metadataPath)
  await provider.refresh()
  assert.equal(provider.getLatestAppVersion(), '4.0.2')

  await writeFile(metadataPath, 'version: 4.0.3\n', 'utf8')
  await provider.refresh()
  assert.equal(provider.getLatestAppVersion(), '4.0.3')
})

test('runtime app version polling detects a replaced release file', async (context) => {
  const directory = await createTemporaryDirectory(context)
  const metadataPath = path.join(directory, 'latest.yml')
  await writeFile(metadataPath, 'version: 4.0.1\n', 'utf8')

  const provider = await createLatestAppVersionProvider({
    updatesDirectory: directory,
    fallbackVersion: '4.0.0',
    refreshIntervalMs: 10,
  })
  context.after(() => provider.dispose())
  assert.equal(provider.getLatestAppVersion(), '4.0.1')

  await writeFile(metadataPath, 'version: 4.0.2\n', 'utf8')
  await waitFor(() => provider.getLatestAppVersion() === '4.0.2')
})
