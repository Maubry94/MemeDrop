import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveTikTokVideo } from './tiktok.js'

test('TikTok resolver validates the host before any request', async () => {
  let calls = 0
  const result = await resolveTikTokVideo('http://127.0.0.1/internal', async () => {
    calls += 1
    return new Response()
  })

  assert.equal(result, null)
  assert.equal(calls, 0)
})

test('TikTok resolver accepts a direct video without a network request', async () => {
  let calls = 0
  const result = await resolveTikTokVideo(
    'http://www.tiktok.com/@creator/video/1234567890123456789#fragment',
    async () => {
      calls += 1
      return new Response()
    },
  )

  assert.deepEqual(result, {
    id: '1234567890123456789',
    url: 'https://www.tiktok.com/@creator/video/1234567890123456789',
  })
  assert.equal(calls, 0)
})

test('TikTok resolver accepts the official player URL', async () => {
  let calls = 0
  const result = await resolveTikTokVideo(
    'https://www.tiktok.com/player/v1/1234567890123456789',
    async () => {
      calls += 1
      return new Response()
    },
  )

  assert.deepEqual(result, {
    id: '1234567890123456789',
    url: 'https://www.tiktok.com/player/v1/1234567890123456789',
  })
  assert.equal(calls, 0)
})

test('TikTok resolver rejects redirects outside the strict allowlist', async () => {
  const requestedUrls: string[] = []
  const result = await resolveTikTokVideo('https://vm.tiktok.com/short', async (input) => {
    requestedUrls.push(input.toString())
    return new Response(null, {
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data' },
    })
  })

  assert.equal(result, null)
  assert.deepEqual(requestedUrls, ['https://vm.tiktok.com/short'])
})

test('TikTok resolver follows allowed redirects manually', async () => {
  const requestedUrls: string[] = []
  const result = await resolveTikTokVideo('https://vm.tiktok.com/short', async (requestInput) => {
    requestedUrls.push(requestInput.toString())
    return new Response(null, {
      status: 302,
      headers: {
        location: 'https://www.tiktok.com/@creator/video/1234567890123456789',
      },
    })
  })

  assert.deepEqual(result, {
    id: '1234567890123456789',
    url: 'https://www.tiktok.com/@creator/video/1234567890123456789',
  })
  assert.deepEqual(requestedUrls, ['https://vm.tiktok.com/short'])
})
