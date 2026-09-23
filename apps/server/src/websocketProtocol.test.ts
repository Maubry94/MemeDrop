import assert from 'node:assert/strict'
import test from 'node:test'
import { parseClientMessage } from './websocketProtocol.js'

test('WebSocket messages use an exact schema', () => {
  assert.deepEqual(parseClientMessage('{"type":"drop-completed","dropId":"youtube-123_abc"}'), {
    type: 'drop-completed',
    dropId: 'youtube-123_abc',
  })
  assert.deepEqual(parseClientMessage('{"type":"client-state","dropsEnabled":false}'), {
    type: 'client-state',
    dropsEnabled: false,
  })
  assert.equal(parseClientMessage('{"type":"client-state"}'), null)
  assert.equal(parseClientMessage('{"type":"drop-stop","dropId":"ok","extra":true}'), null)
  assert.equal(parseClientMessage('{"type":"drop-stop","dropId":"../secret"}'), null)
  assert.equal(parseClientMessage('[]'), null)
})

test('completion reasons are optional for older apps and strictly validated', () => {
  for (const reason of ['ended', 'skipped', 'error', 'timeout']) {
    const message = { type: 'drop-completed', dropId: 'video-1', reason }
    assert.deepEqual(parseClientMessage(JSON.stringify(message)), message)
  }

  for (const reason of [null, true, 1, {}, [], 'unknown', '']) {
    assert.equal(parseClientMessage(JSON.stringify({
      type: 'drop-completed', dropId: 'video-1', reason,
    })), null)
  }
  assert.equal(parseClientMessage(JSON.stringify({
    type: 'drop-completed', dropId: 'video-1', reason: 'ended', extra: true,
  })), null)
  assert.equal(parseClientMessage(JSON.stringify({
    type: 'drop-stop', dropId: 'video-1', reason: 'ended',
  })), null)
})
