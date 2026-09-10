import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createYouTubeEmbedUrl,
  getValidYouTubeClip,
  hasYouTubeClipEnded,
} from './youtubePlayerPolicy.ts'

const clip = {
  id: 'UgkxX9iMIHdwwTqJj6qkzesdnR9FpfTtjYh4',
  token: 'EPzzCRjIrgo',
  videoId: '2tq20QHznrQ',
  startTimeMs: 162_300,
  endTimeMs: 169_800,
}

test('builds the official YouTube clip embed parameters', () => {
  const embedUrl = new URL(createYouTubeEmbedUrl({
    videoId: null,
    clip,
    origin: 'http://127.0.0.1:5173',
  }))

  assert.equal(embedUrl.origin, 'https://www.youtube.com')
  assert.equal(embedUrl.pathname, '/embed/2tq20QHznrQ')
  assert.equal(embedUrl.searchParams.get('clip'), clip.id)
  assert.equal(embedUrl.searchParams.get('clipt'), clip.token)
  assert.equal(embedUrl.searchParams.get('enablejsapi'), '1')
  assert.equal(embedUrl.searchParams.get('origin'), 'http://127.0.0.1:5173')
})

test('keeps regular video embeds unchanged and rejects partial clip metadata', () => {
  const regularUrl = new URL(createYouTubeEmbedUrl({
    videoId: '2tq20QHznrQ',
    clip: null,
    origin: 'http://localhost:5173',
  }))
  assert.equal(regularUrl.searchParams.has('clip'), false)
  assert.equal(regularUrl.searchParams.has('clipt'), false)

  const partialClipUrl = new URL(createYouTubeEmbedUrl({
    videoId: '2tq20QHznrQ',
    clip: { ...clip, token: '' },
    origin: 'http://localhost:5173',
  }))
  assert.equal(partialClipUrl.searchParams.has('clip'), false)
  assert.equal(partialClipUrl.searchParams.has('clipt'), false)
  assert.equal(createYouTubeEmbedUrl({ videoId: 'invalid', clip: null, origin: '' }), '')
})

test('validates YouTube clip timing and identifiers as one atomic value', () => {
  assert.deepEqual(getValidYouTubeClip(clip), clip)
  assert.equal(getValidYouTubeClip({ ...clip, endTimeMs: clip.startTimeMs }), null)
  assert.equal(getValidYouTubeClip({ ...clip, endTimeMs: clip.startTimeMs + 60_001 }), null)
  assert.equal(getValidYouTubeClip({ ...clip, id: 'not a clip' }), null)
  assert.equal(getValidYouTubeClip({ ...clip, videoId: 'not a video' }), null)
})

test('finishes a clip at its end or when the native clip player starts looping', () => {
  assert.equal(hasYouTubeClipEnded({
    clip,
    previousTimeSeconds: 169.4,
    currentTimeSeconds: 169.7,
  }), true)
  assert.equal(hasYouTubeClipEnded({
    clip,
    previousTimeSeconds: 169.6,
    currentTimeSeconds: 162.4,
  }), true)
  assert.equal(hasYouTubeClipEnded({
    clip,
    previousTimeSeconds: 165,
    currentTimeSeconds: 165.5,
  }), false)
  assert.equal(hasYouTubeClipEnded({
    clip: null,
    previousTimeSeconds: 449,
    currentTimeSeconds: 0,
  }), false)
})
