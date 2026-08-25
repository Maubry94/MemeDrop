import assert from 'node:assert/strict'
import test from 'node:test'
import {
  IMAGE_DISPLAY_TIMEOUT_MS,
  getImageDisplayTimeout,
} from './nativeMediaPolicy.ts'

test('disables the display timeout for previews but keeps it for regular images', () => {
  assert.equal(getImageDisplayTimeout(true), null)
  assert.equal(getImageDisplayTimeout(false), IMAGE_DISPLAY_TIMEOUT_MS)
})
