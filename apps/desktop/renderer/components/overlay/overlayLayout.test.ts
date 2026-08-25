import assert from 'node:assert/strict'
import test from 'node:test'
import { getOverlayWrapperStyle } from './overlayLayout.ts'

test('keeps custom overlay sizing independent from its horizontal position', () => {
  assert.deepEqual(
    getOverlayWrapperStyle(true, {
      left: '100%',
      top: '50%',
      transform: 'translate(-100%, -50%)',
    }),
    {
      left: '100%',
      top: '50%',
      transform: 'translate(-100%, -50%)',
      width: 'max-content',
      maxWidth: '90vw',
    },
  )
})

test('does not constrain the full-screen positioning wrapper', () => {
  assert.deepEqual(getOverlayWrapperStyle(false, { left: '100%' }), {})
})
