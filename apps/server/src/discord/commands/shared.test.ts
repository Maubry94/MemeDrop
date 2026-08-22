import assert from 'node:assert/strict'
import test from 'node:test'
import { getPublicGuideUrl } from './shared.js'

test('public guide URL points to the dedicated guide page', () => {
  assert.equal(
    getPublicGuideUrl('https://memedrop.example.com/'),
    'https://memedrop.example.com/guide',
  )
  assert.equal(getPublicGuideUrl(), null)
})
