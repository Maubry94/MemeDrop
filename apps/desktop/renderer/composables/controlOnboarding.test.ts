import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getControlOnboardingStep,
  isServerConfigComplete,
} from './controlOnboarding.ts'

const createConfig = (
  overrides: Partial<{
    serverUrl: string
    accessKey: string
    discordUserId: string
  }> = {},
) => ({
  serverUrl: 'https://memedrop.example.com',
  accessKey: 'a-valid-shared-key',
  discordUserId: '',
  ...overrides,
})

describe('control onboarding', () => {
  it('keeps the loading view until initial state hydration is complete', () => {
    assert.equal(
      getControlOnboardingStep({
        isInitialStateLoaded: false,
        serverConfig: createConfig({ discordUserId: 'discord-user' }),
      }),
      'loading',
    )
  })

  it('requires both a server URL and an access key', () => {
    assert.equal(
      isServerConfigComplete(createConfig({ serverUrl: '   ' })),
      false,
    )
    assert.equal(
      isServerConfigComplete(createConfig({ accessKey: '\t' })),
      false,
    )
    assert.equal(
      isServerConfigComplete(createConfig({ accessKey: 'too-short' })),
      false,
    )
    assert.equal(isServerConfigComplete(createConfig()), true)
  })

  it('shows server setup before Discord when configuration is incomplete', () => {
    assert.equal(
      getControlOnboardingStep({
        isInitialStateLoaded: true,
        serverConfig: createConfig({ accessKey: '' }),
      }),
      'server-setup',
    )
  })

  it('keeps an authenticated control panel mounted while its form is edited', () => {
    assert.equal(
      getControlOnboardingStep({
        isInitialStateLoaded: true,
        serverConfig: createConfig({ accessKey: '', discordUserId: 'discord-user' }),
      }),
      'complete',
    )
  })

  it('continues with Discord after the server is configured', () => {
    assert.equal(
      getControlOnboardingStep({
        isInitialStateLoaded: true,
        serverConfig: createConfig(),
      }),
      'discord-authentication',
    )
  })

  it('completes onboarding for an authenticated Discord account', () => {
    assert.equal(
      getControlOnboardingStep({
        isInitialStateLoaded: true,
        serverConfig: createConfig({ discordUserId: ' discord-user ' }),
      }),
      'complete',
    )
  })
})
