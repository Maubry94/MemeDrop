import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getYouTubeVideoId,
  isValidYouTubeVideoId,
  resolveYouTubeVideo,
} from './youtube.js'

const VIDEO_ID = 'dQw4w9WgXcQ'
const OTHER_VIDEO_ID = 'aqz-KE-bpKQ'
const CLIP_ID = 'Ugkx9B8Is7_TkTNBWaw6a2NZXFEFZCnQzSft'
const SUPPLIED_VIDEO_ID = '2tq20QHznrQ'
const SUPPLIED_CLIP_ID = 'UgkxX9iMIHdwwTqJj6qkzesdnR9FpfTtjYh4'
const SUPPLIED_CLIP_TOKEN = 'EPzzCRjIrgo'
const CLIP_TOKEN = 'EKzEARiLhQM'

type ClipFixtureOptions = {
  videoId?: string
  postId?: string
  startTimeMs?: number | string
  endTimeMs?: number | string
  iframeUrl?: string
}

const createClipHtml = ({
  videoId = VIDEO_ID,
  postId = CLIP_ID,
  startTimeMs = '12',
  endTimeMs = '49123',
  iframeUrl = `https://www.youtube.com/embed/${VIDEO_ID}?clip=${CLIP_ID}&clipt=${CLIP_TOKEN}`,
}: ClipFixtureOptions = {}) => {
  const playerResponse = {
    videoDetails: { videoId },
    clipConfig: { postId, startTimeMs, endTimeMs },
    microformat: {
      playerMicroformatRenderer: {
        embed: { iframeUrl },
      },
    },
  }

  return `<!doctype html><script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script>`
}

const htmlResponse = (body: BodyInit) => new Response(body, {
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8' },
})

test('legacy YouTube helpers keep recognizing supported video links and IDs', () => {
  assert.equal(getYouTubeVideoId(`https://youtu.be/${VIDEO_ID}?t=1`), VIDEO_ID)
  assert.equal(getYouTubeVideoId(`youtube.com/watch?v=${VIDEO_ID}`), VIDEO_ID)
  assert.equal(getYouTubeVideoId(`https://m.youtube.com/shorts/${VIDEO_ID}`), VIDEO_ID)
  assert.equal(getYouTubeVideoId(`https://music.youtube.com/embed/${VIDEO_ID}`), VIDEO_ID)
  assert.equal(getYouTubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ'), null)
  assert.equal(isValidYouTubeVideoId(VIDEO_ID), true)
  assert.equal(isValidYouTubeVideoId(`${VIDEO_ID}x`), false)
})

test('direct YouTube videos resolve canonically without a network request', async () => {
  let calls = 0
  const result = await resolveYouTubeVideo(
    `http://youtu.be/${VIDEO_ID}?si=share-value#fragment`,
    async () => {
      calls += 1
      return htmlResponse('')
    },
  )

  assert.deepEqual(result, {
    id: VIDEO_ID,
    url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    clip: null,
  })
  assert.equal(calls, 0)
})

test('YouTube clips are fetched only through the fixed canonical URL and resolved safely', async () => {
  const requestedUrls: string[] = []
  let requestInit: RequestInit | undefined
  const result = await resolveYouTubeVideo(
    `https://youtube.com/clip/${CLIP_ID}?si=untrusted-share-value#fragment`,
    async (input, init) => {
      requestedUrls.push(input.toString())
      requestInit = init
      return htmlResponse(createClipHtml())
    },
  )

  assert.deepEqual(requestedUrls, [
    `https://www.youtube.com/clip/${CLIP_ID}?cbrd=1&ucbcb=1&hl=en`,
  ])
  assert.equal(requestInit?.redirect, 'error')
  assert.ok(requestInit?.signal instanceof AbortSignal)
  assert.deepEqual(result, {
    id: VIDEO_ID,
    url: `https://www.youtube.com/clip/${CLIP_ID}`,
    clip: {
      id: CLIP_ID,
      token: CLIP_TOKEN,
      videoId: VIDEO_ID,
      startTimeMs: 12,
      endTimeMs: 49123,
    },
  })
})

test('the supplied public clip URL shape is accepted', async () => {
  const iframeUrl =
    `https://www.youtube.com/embed/${SUPPLIED_VIDEO_ID}?clip=${SUPPLIED_CLIP_ID}&clipt=${SUPPLIED_CLIP_TOKEN}`
  const result = await resolveYouTubeVideo(
    `https://www.youtube.com/clip/${SUPPLIED_CLIP_ID}?si=j0gMDCpDm83KLjCr`,
    async () => htmlResponse(createClipHtml({
      videoId: SUPPLIED_VIDEO_ID,
      postId: SUPPLIED_CLIP_ID,
      startTimeMs: 162_300,
      endTimeMs: 169_800,
      iframeUrl,
    })),
  )

  assert.deepEqual(result, {
    id: SUPPLIED_VIDEO_ID,
    url: `https://www.youtube.com/clip/${SUPPLIED_CLIP_ID}`,
    clip: {
      id: SUPPLIED_CLIP_ID,
      token: SUPPLIED_CLIP_TOKEN,
      videoId: SUPPLIED_VIDEO_ID,
      startTimeMs: 162_300,
      endTimeMs: 169_800,
    },
  })
})

test('clip resolution never requests hostile or ambiguous input URLs', async () => {
  let calls = 0
  const hostileUrls = [
    `https://youtube.com.evil.example/clip/${CLIP_ID}`,
    `https://youtube.com@evil.example/clip/${CLIP_ID}`,
    `https://user:password@www.youtube.com/clip/${CLIP_ID}`,
    `https://www.youtube.com:444/clip/${CLIP_ID}`,
    `https://www.youtube.com/clip/${CLIP_ID}/extra`,
    `https://youtu.be/clip/${CLIP_ID}`,
    'https://www.youtube.com/clip/not%2Fa%2Fclip',
    'javascript:https://www.youtube.com/clip/fake',
  ]

  for (const hostileUrl of hostileUrls) {
    assert.equal(await resolveYouTubeVideo(hostileUrl, async () => {
      calls += 1
      return htmlResponse(createClipHtml())
    }), null)
  }

  assert.equal(calls, 0)
})

test('clip metadata must match the requested clip, video, official iframe and bounded duration', async () => {
  const invalidFixtures = [
    createClipHtml({ postId: `${CLIP_ID}x` }),
    createClipHtml({ iframeUrl: `https://www.youtube.com/embed/${OTHER_VIDEO_ID}?clip=${CLIP_ID}&clipt=${CLIP_TOKEN}` }),
    createClipHtml({ iframeUrl: `https://youtube-nocookie.com/embed/${VIDEO_ID}?clip=${CLIP_ID}&clipt=${CLIP_TOKEN}` }),
    createClipHtml({ iframeUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}&clip=${CLIP_ID}&clipt=${CLIP_TOKEN}` }),
    createClipHtml({ iframeUrl: `https://www.youtube.com/embed/${VIDEO_ID}?clip=wrong&clipt=${CLIP_TOKEN}` }),
    createClipHtml({ iframeUrl: `https://www.youtube.com/embed/${VIDEO_ID}?clip=${CLIP_ID}` }),
    createClipHtml({ iframeUrl: `https://www.youtube.com/embed/${VIDEO_ID}?clip=${CLIP_ID}&clipt=bad%2Ftoken` }),
    createClipHtml({ startTimeMs: 20, endTimeMs: 20 }),
    createClipHtml({ startTimeMs: 20, endTimeMs: 60_021 }),
  ]

  for (const fixture of invalidFixtures) {
    const result = await resolveYouTubeVideo(
      `https://www.youtube.com/clip/${CLIP_ID}`,
      async () => htmlResponse(fixture),
    )
    assert.equal(result, null)
  }
})

test('redirect and non-HTML responses are rejected', async () => {
  const redirectResult = await resolveYouTubeVideo(
    `https://www.youtube.com/clip/${CLIP_ID}`,
    async () => new Response(null, {
      status: 302,
      headers: {
        location: 'https://evil.example/private',
        'content-type': 'text/html',
      },
    }),
  )
  assert.equal(redirectResult, null)

  const nonHtmlResult = await resolveYouTubeVideo(
    `https://www.youtube.com/clip/${CLIP_ID}`,
    async () => new Response(createClipHtml(), {
      headers: { 'content-type': 'application/json' },
    }),
  )
  assert.equal(nonHtmlResult, null)
})

test('decoded HTML streams larger than 4 MiB are cancelled and rejected', async () => {
  let wasCancelled = false
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(3 * 1024 * 1024))
    },
    cancel() {
      wasCancelled = true
    },
  })

  const result = await resolveYouTubeVideo(
    `https://www.youtube.com/clip/${CLIP_ID}`,
    async () => htmlResponse(body),
  )

  assert.equal(result, null)
  assert.equal(wasCancelled, true)
})

test('malformed player data is rejected without executing page code', async () => {
  const marker = '__memedropYoutubeResolverExecuted'
  delete (globalThis as Record<string, unknown>)[marker]
  const html = `<script>var ytInitialPlayerResponse = (() => { globalThis.${marker} = true; return {}; })();</script>`

  const result = await resolveYouTubeVideo(
    `https://www.youtube.com/clip/${CLIP_ID}`,
    async () => htmlResponse(html),
  )

  assert.equal(result, null)
  assert.equal((globalThis as Record<string, unknown>)[marker], undefined)
})
