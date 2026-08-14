import assert from 'node:assert/strict'
import test from 'node:test'
import type { Display, Rectangle } from 'electron'
import {
  CONTROL_WINDOW_DEFAULT_HEIGHT,
  CONTROL_WINDOW_DEFAULT_WIDTH,
  CONTROL_WINDOW_MIN_HEIGHT,
  getControlWindowBounds,
} from './displays.ts'

const createDisplay = (
  id: number,
  workArea: Rectangle,
  scaleFactor = 1,
): Display => ({
  id,
  bounds: { ...workArea },
  workArea: { ...workArea },
  scaleFactor,
}) as Display

const intersectionArea = (first: Rectangle, second: Rectangle) => {
  const width = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) -
      Math.max(first.x, second.x),
  )
  const height = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) -
      Math.max(first.y, second.y),
  )
  return width * height
}

const createScreen = (displays: Display[], primaryDisplay = displays[0]) => {
  assert.ok(primaryDisplay)
  return {
    getPrimaryDisplay: () => primaryDisplay,
    getAllDisplays: () => displays,
    getDisplayMatching: (rect: Rectangle) => {
      let bestDisplay = primaryDisplay
      let bestArea = 0
      for (const display of displays) {
        const area = intersectionArea(rect, display.bounds)
        if (area > bestArea) {
          bestDisplay = display
          bestArea = area
        }
      }
      return bestDisplay
    },
  }
}

test('uses the default size and keeps it inside the primary work area', () => {
  const display = createDisplay(1, { x: 0, y: 0, width: 1280, height: 720 })

  assert.deepEqual(getControlWindowBounds(createScreen([display]), {}), {
    x: 350,
    y: 0,
    width: CONTROL_WINDOW_DEFAULT_WIDTH,
    height: 720,
  })
})

test('restores a saved height between the minimum and default heights', () => {
  const display = createDisplay(1, { x: 0, y: 0, width: 1920, height: 1040 })

  assert.deepEqual(
    getControlWindowBounds(createScreen([display]), {
      x: 100,
      y: 120,
      width: 900,
      height: 420,
    }),
    { x: 100, y: 120, width: 900, height: 420 },
  )
  assert.ok(420 >= CONTROL_WINDOW_MIN_HEIGHT)
  assert.ok(420 < CONTROL_WINDOW_DEFAULT_HEIGHT)
})

test('clamps an oversized window completely inside its work area', () => {
  const display = createDisplay(1, { x: 0, y: 0, width: 1920, height: 1040 })

  assert.deepEqual(
    getControlWindowBounds(createScreen([display]), {
      x: -300,
      y: -200,
      width: 3000,
      height: 2000,
    }),
    { x: 0, y: 0, width: 1920, height: 1040 },
  )
})

test('clamps saved coordinates within a negative-origin mixed-DPI display in DIP', () => {
  const primary = createDisplay(1, { x: 0, y: 0, width: 1920, height: 1040 })
  const left = createDisplay(2, { x: -1920, y: 0, width: 1920, height: 1040 }, 1.5)

  assert.deepEqual(
    getControlWindowBounds(createScreen([primary, left], primary), {
      x: -2000,
      y: 900,
      width: 900,
      height: 500,
    }),
    { x: -1920, y: 540, width: 900, height: 500 },
  )
})

test('brings coordinates from a removed display back into the primary work area', () => {
  const primary = createDisplay(1, { x: 0, y: 0, width: 1920, height: 1040 }, 2)

  assert.deepEqual(
    getControlWindowBounds(createScreen([primary]), {
      x: 2500,
      y: 200,
      width: 800,
      height: 600,
    }),
    { x: 1120, y: 200, width: 800, height: 600 },
  )
})

test('falls back from invalid persisted values to the bounded defaults', () => {
  const display = createDisplay(1, { x: 0, y: 0, width: 1920, height: 1040 })

  assert.deepEqual(
    getControlWindowBounds(createScreen([display]), {
      x: Number.NaN,
      y: Number.POSITIVE_INFINITY,
      width: Number.NaN,
      height: -1,
    }),
    {
      x: 670,
      y: 110,
      width: CONTROL_WINDOW_DEFAULT_WIDTH,
      height: CONTROL_WINDOW_DEFAULT_HEIGHT,
    },
  )
})
