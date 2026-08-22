import assert from 'node:assert/strict'
import test from 'node:test'
import type { ConnectionState, ConnectionStatus } from '../../shared/types.ts'
import { getConnectionPresentation } from './connectionPresentation.ts'

const createStatus = (state: ConnectionState): ConnectionStatus => ({
  state,
  level: state === 'refused' || state === 'error' ? 'error' : 'info',
  message: `Message ${state}`,
})

test('technical connection phases map to five stable user-facing states', () => {
  const expectedStates: Array<[
    ConnectionState,
    ReturnType<typeof getConnectionPresentation>['state'],
    ReturnType<typeof getConnectionPresentation>['label'],
  ]> = [
    ['configuration-required', 'offline', 'Hors ligne'],
    ['authentication-required', 'offline', 'Hors ligne'],
    ['connecting', 'connecting', 'Connexion…'],
    ['authenticating', 'connecting', 'Connexion…'],
    ['connected', 'connected', 'En ligne'],
    ['reconnecting', 'reconnecting', 'Reconnexion…'],
    ['refused', 'error', 'Erreur'],
    ['error', 'error', 'Erreur'],
  ]

  for (const [technicalState, presentationState, label] of expectedStates) {
    const presentation = getConnectionPresentation(createStatus(technicalState))
    assert.equal(presentation.state, presentationState)
    assert.equal(presentation.label, label)
    assert.equal(presentation.message, `Message ${technicalState}`)
  }
})

test('an absent snapshot is presented as an initial connection attempt', () => {
  assert.deepEqual(getConnectionPresentation(null), {
    state: 'connecting',
    label: 'Connexion…',
    tone: 'progress',
    isError: false,
    message: 'Connexion au serveur MemeDrop en cours.',
  })
})

test('empty producer messages fall back to the state default', () => {
  const presentation = getConnectionPresentation({
    state: 'connected',
    level: 'info',
    message: '   ',
  })

  assert.equal(presentation.message, 'MemeDrop est prêt à recevoir des drops.')
})
