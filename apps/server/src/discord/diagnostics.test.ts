import assert from 'node:assert/strict'
import test from 'node:test'
import type { ChatInputCommandInteraction } from 'discord.js'
import {
  getDiscordErrorDetails,
  logDiscordFailure,
  logDiscordRestResponse,
  logDropEnqueued,
  measureDiscordPhase,
  runWithDiscordDiagnostics,
} from './diagnostics.js'

const timestamp = 1790295160000
const snowflake = (time: number) => String(BigInt(time - 1420070400000) << 22n)
const interaction = (time = timestamp) => ({
  id: snowflake(time),
  commandName: 'drop',
  createdTimestamp: time,
  token: 'SECRET_INTERACTION_TOKEN',
  options: {
    getAttachment: () => ({
      id: snowflake(time - 20_000), size: 8_000_000,
      url: 'https://cdn.discordapp.com/private?hm=SECRET_SIGNATURE',
      name: 'PRIVATE_FILENAME',
    }),
  },
}) as unknown as ChatInputCommandInteraction

const capture = () => {
  const lines: string[] = []
  return {
    lines,
    logger: (line: string) => lines.push(line),
    events: () => lines.map((line) => JSON.parse(line.slice('[discord-diag] '.length)) as Record<string, unknown>),
  }
}

test('diagnostics separate interaction/attachment ages from monotonic phase timings', async () => {
  const output = capture()
  let time = 0
  await runWithDiscordDiagnostics(interaction(), async () => {
    await measureDiscordPhase('ack', async () => { time = 250 })
    await measureDiscordPhase('execute', async () => {
      logDropEnqueued('youtube-example-1234', 6)
      await measureDiscordPhase('reply', async () => { time = 300 })
    })
  }, { logger: output.logger, now: () => time, wallNow: () => timestamp + 100 })
  const events = output.events()
  assert.equal(events[0]?.ageMs, 100)
  assert.equal(events[0]?.attachmentAgeMs, 20_100)
  assert.equal(events[0]?.attachmentBytes, 8_000_000)
  assert.equal(events.find((event) => event.phase === 'ack' && event.event === 'phase-end')?.durationMs, 250)
  assert.equal(events.find((event) => event.phase === 'reply' && event.event === 'phase-end')?.durationMs, 50)
  assert.equal(events.at(-1)?.event, 'completed')
  assert.equal(events.at(-1)?.elapsedMs, 300)
  assert.equal(events.at(-1)?.enqueued, true)
  assert.equal(events.at(-1)?.failed, false)
  assert.ok(events.every((event) => event.interactionId === snowflake(timestamp)))
  assert.doesNotMatch(output.lines.join('\n'), /SECRET|PRIVATE_FILENAME|https:/)
})

test('concurrent commands keep separate trace ids and phase context across awaits', async () => {
  const output = capture()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const first = runWithDiscordDiagnostics(interaction(), () => measureDiscordPhase('ack', async () => {
    await gate
    logDiscordRestResponse({ route: 'interaction-callback', method: 'POST', status: 204, retries: 1 })
  }), { logger: output.logger })
  await runWithDiscordDiagnostics(interaction(timestamp + 1), () => measureDiscordPhase('reply', async () => {
    logDiscordRestResponse({ route: 'original-response', method: 'PATCH', status: 200, retries: 0 })
  }), { logger: output.logger })
  release()
  await first
  const responses = output.events().filter((event) => event.event === 'rest-response')
  assert.deepEqual(responses.map((event) => [event.interactionId, event.phase, event.status]), [
    [snowflake(timestamp + 1), 'reply', 200], [snowflake(timestamp), 'ack', 204],
  ])
})

test('failed phases preserve the error but log only safe error details', async () => {
  const output = capture()
  const error = Object.assign(new Error('SECRET_TOKEN in callback url'), {
    code: 10062, status: 404, url: 'https://discord.com/interactions/SECRET_TOKEN',
    requestBody: { token: 'SECRET_TOKEN' },
  })
  await assert.rejects(runWithDiscordDiagnostics(interaction(), () =>
    measureDiscordPhase('ack', async () => { throw error }),
  { logger: output.logger }), (caught) => caught === error)
  const failed = output.events().find((event) => event.event === 'phase-error')
  assert.equal(failed?.code, 10062)
  assert.equal(failed?.status, 404)
  assert.equal(output.events().at(-1)?.failed, true)
  assert.equal(output.events().at(-1)?.enqueued, false)
  assert.doesNotMatch(output.lines.join('\n'), /SECRET|https:/)
  assert.deepEqual(getDiscordErrorDetails({ code: 'SECRET_TOKEN', name: 'SECRET_TOKEN', status: NaN }), {
    name: null, code: null, status: null,
  })
  assert.equal(getDiscordErrorDetails({ cause: { code: 'ECONNRESET' } }).code, 'ECONNRESET')
  assert.equal(getDiscordErrorDetails({ name: 'AbortError' }).name, 'AbortError')
})

test('a reply error keeps the fact that the drop was already enqueued', async () => {
  const output = capture()
  await runWithDiscordDiagnostics(interaction(), async () => {
    logDropEnqueued('123456789012345678', 1)
    logDiscordFailure({ code: 10062, status: 404 })
  }, { logger: output.logger })
  assert.equal(output.events().at(-1)?.enqueued, true)
  assert.equal(output.events().at(-1)?.failed, true)
})

test('a rejected drop is not reported as enqueued', async () => {
  const output = capture()
  await runWithDiscordDiagnostics(interaction(), async () => {
    logDropEnqueued('123456789012345678', 0)
  }, { logger: output.logger })
  assert.ok(output.events().some((event) => event.event === 'drop-rejected'))
  assert.ok(!output.events().some((event) => event.event === 'drop-enqueued'))
  assert.equal(output.events().at(-1)?.enqueued, false)
})

test('closed traces ignore late asynchronous responses', async () => {
  const output = capture()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let late!: Promise<void>
  await runWithDiscordDiagnostics(interaction(), async () => {
    late = gate.then(() => logDiscordRestResponse({ route: 'interaction-callback', method: 'POST', status: 204, retries: 0 }))
  }, { logger: output.logger })
  const count = output.lines.length
  release()
  await late
  assert.equal(output.lines.length, count)
})

test('disabled instrumentation and a failing diagnostic logger do not change results', async () => {
  assert.equal(await measureDiscordPhase('ack', async () => 42), 42)
  logDiscordFailure({ code: 10062 })
  logDiscordRestResponse({ route: 'interaction-callback', method: 'POST', status: 429, retries: 0 })
  assert.equal(await runWithDiscordDiagnostics(interaction(), () =>
    measureDiscordPhase('execute', async () => 42),
  { logger: () => { throw new Error('logger unavailable') } }), 42)
})

test('missing attachment metadata cannot prevent command handling and clock skew stays visible', async () => {
  const output = capture()
  const item = interaction()
  item.options.getAttachment = () => { throw new Error('malformed option') }
  assert.equal(await runWithDiscordDiagnostics(item, async () => 42,
    { logger: output.logger, wallNow: () => timestamp - 1_000 }), 42)
  assert.equal(output.events()[0]?.attachmentId, null)
  assert.equal(output.events()[0]?.ageMs, -1_000)
})
