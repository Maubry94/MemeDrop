import assert from 'node:assert/strict'
import test from 'node:test'
import { getSignedWindowsUpdateRequestPath } from './updateRoute.js'

test('update route exposes only the signed Windows channel', () => {
  assert.equal(
    getSignedWindowsUpdateRequestPath('GET', '/updates/win-signed-v1/latest.yml'),
    'latest.yml',
  )
  assert.equal(
    getSignedWindowsUpdateRequestPath('HEAD', '/updates/win-signed-v1/latest.yml'),
    'latest.yml',
  )
  assert.equal(
    getSignedWindowsUpdateRequestPath('POST', '/updates/win-signed-v1/latest.yml'),
    null,
  )
  assert.equal(getSignedWindowsUpdateRequestPath('GET', '/updates/win/latest.yml'), null)
  assert.equal(getSignedWindowsUpdateRequestPath('GET', '/updates/win-signed-v10/latest.yml'), null)
})
