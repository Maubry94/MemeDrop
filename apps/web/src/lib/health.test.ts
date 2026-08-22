import assert from 'node:assert/strict'
import test from 'node:test'
import { getHealthPresentation, parseHealthPayload } from './health.ts'

test('parseHealthPayload accepts the current backend response', () => {
  assert.deepEqual(parseHealthPayload({
    ok: true,
    discordStatus: 'connected',
    clients: 3,
    latestAppVersion: '4.0.1',
  }), {
    ok: true,
    discordStatus: 'connected',
    clients: 3,
    latestAppVersion: '4.0.1',
  })
})

test('parseHealthPayload rejects the proxy unavailable response', () => {
  assert.equal(parseHealthPayload({ ok: false, error: 'backend_unavailable' }), null)
})

test('parseHealthPayload rejects invalid response fields', () => {
  assert.equal(parseHealthPayload(null), null)
  assert.equal(parseHealthPayload({ ok: true }), null)
  assert.equal(parseHealthPayload({
    ok: true,
    discordStatus: 'connected',
    clients: -1,
    latestAppVersion: '4.0.1',
  }), null)
  assert.equal(parseHealthPayload({
    ok: true,
    discordStatus: '',
    clients: 1,
    latestAppVersion: '4.0.1',
  }), null)
})

test('connected backend and Discord are presented as operational', () => {
  const presentation = getHealthPresentation({
    ok: true,
    discordStatus: 'connected',
    clients: 2,
    latestAppVersion: '4.0.1',
  })

  assert.equal(presentation.state, 'operational')
  assert.equal(presentation.title, 'Tous les services sont opérationnels')
  assert.equal(presentation.server.label, 'Disponible')
  assert.equal(presentation.discord.label, 'En ligne')
  assert.equal(presentation.clients, '2')
})

test('a starting Discord bot is presented as degraded', () => {
  const presentation = getHealthPresentation({
    ok: true,
    discordStatus: 'starting',
    clients: 0,
    latestAppVersion: '4.0.1',
  })

  assert.equal(presentation.state, 'degraded')
  assert.equal(presentation.title, 'Service dégradé')
  assert.equal(presentation.discord.label, 'Démarrage')
  assert.equal(presentation.discord.tone, 'warning')
})

test('a Discord error is presented as degraded', () => {
  const presentation = getHealthPresentation({
    ok: true,
    discordStatus: 'error',
    clients: 0,
    latestAppVersion: '4.0.1',
  })

  assert.equal(presentation.state, 'degraded')
  assert.equal(presentation.discord.label, 'Hors ligne')
  assert.equal(presentation.discord.tone, 'danger')
})

test('a missing payload is presented as unavailable', () => {
  const presentation = getHealthPresentation(null)

  assert.equal(presentation.state, 'unavailable')
  assert.equal(presentation.title, 'Serveur MemeDrop indisponible')
  assert.equal(presentation.server.label, 'Indisponible')
  assert.equal(presentation.clients, '—')
})
