import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import type { Interaction } from 'discord.js'
import type { Drop } from '@memedrop/protocol'
import { createInteractionHandler } from './interactions.js'

const interactionId = '1552835617849614506'
const attachmentId = '1552824485491773440'
const privateToken = 'private-interaction-token'

const unknownInteractionError = () => Object.assign(
  new Error(`Unknown interaction: https://discord.com/api/interactions/${privateToken}`),
  {
    code: 10062,
    status: 404,
    url: `https://discord.com/api/interactions/${privateToken}/callback`,
    requestBody: { token: privateToken, content: 'private-response-content' },
    headers: { authorization: `Bot ${privateToken}` },
  },
)

const createFixture = (
  context: TestContext,
  options: {
    diagnosticsEnabled?: boolean
    acknowledge?: () => Promise<void>
    reply?: () => Promise<void>
  } = {},
) => {
  const output: unknown[][] = []
  context.mock.method(console, 'log', (...args: unknown[]) => { output.push(args) })
  context.mock.method(console, 'error', (...args: unknown[]) => { output.push(args) })
  const broadcastDrop = context.mock.fn((_drop: Drop) => 3)
  const deferred = { value: false }
  const acknowledge = context.mock.fn(async () => {
    await options.acknowledge?.()
    deferred.value = true
  })
  const reply = context.mock.fn(async () => { await options.reply?.() })
  const interaction = {
    id: interactionId,
    commandName: 'drop',
    createdTimestamp: Date.now() - 100,
    channelId: '1552835617849614507',
    get deferred() { return deferred.value },
    user: {
      id: '1552835617849614508',
      tag: 'test-user',
      username: 'test-user',
      displayAvatarURL: () => 'https://example.invalid/avatar.png',
    },
    options: {
      getAttachment: () => ({
        id: attachmentId,
        name: 'video.mp4',
        contentType: 'video/mp4',
        size: 1_024,
        url: `https://cdn.discordapp.com/attachments/1552835617849614507/${attachmentId}/video.mp4`,
      }),
      getString: () => null,
      getBoolean: () => false,
    },
    isButton: () => false,
    isAutocomplete: () => false,
    isChatInputCommand: () => true,
    deferReply: acknowledge,
    editReply: reply,
  } as unknown as Interaction
  const handle = createInteractionHandler({
    getLatestAppVersion: () => '4.0.6',
    allowedRoleIds: [],
    allowedChannelIds: [],
    dropCooldownSeconds: 0,
    broadcastDrop,
    getConnectedUsers: () => [],
    stopDropByOwner: () => false,
    ...(options.diagnosticsEnabled === undefined
      ? {} : { diagnosticsEnabled: options.diagnosticsEnabled }),
  })
  return {
    run: () => handle(interaction),
    broadcastDrop,
    acknowledge,
    reply,
    output,
    entries: () => output
      .flatMap(args => args.filter((arg): arg is string =>
        typeof arg === 'string' && arg.startsWith('[discord-diag] ')))
      .map(line => JSON.parse(line.slice('[discord-diag] '.length)) as Record<string, unknown>),
  }
}

test('drop diagnostics preserve the acknowledgment gate and trace one enqueue and reply', async context => {
  let releaseAcknowledgment!: () => void
  let enteredAcknowledgment!: () => void
  const gate = new Promise<void>(resolve => { releaseAcknowledgment = resolve })
  const entered = new Promise<void>(resolve => { enteredAcknowledgment = resolve })
  const fixture = createFixture(context, {
    diagnosticsEnabled: true,
    acknowledge: async () => {
      enteredAcknowledgment()
      await gate
    },
  })

  const running = fixture.run()
  await entered
  assert.equal(fixture.acknowledge.mock.callCount(), 1)
  assert.equal(fixture.broadcastDrop.mock.callCount(), 0)
  assert.equal(fixture.reply.mock.callCount(), 0)
  assert.deepEqual(fixture.entries().map(entry => [entry.event, entry.phase]), [
    ['received', undefined],
    ['phase-start', 'ack'],
  ])

  releaseAcknowledgment()
  await running
  assert.equal(fixture.broadcastDrop.mock.callCount(), 1)
  const sentDrop = fixture.broadcastDrop.mock.calls[0]?.arguments[0]
  assert.ok(sentDrop)
  assert.equal(sentDrop.id, attachmentId)
  assert.equal(fixture.reply.mock.callCount(), 1)
  const entries = fixture.entries()
  assert.ok(entries.every(entry => entry.interactionId === interactionId && entry.command === 'drop'))
  assert.deepEqual(entries.map(entry => [entry.event, entry.phase]), [
    ['received', undefined],
    ['phase-start', 'ack'],
    ['phase-end', 'ack'],
    ['phase-start', 'execute'],
    ['drop-enqueued', 'execute'],
    ['phase-start', 'reply'],
    ['phase-end', 'reply'],
    ['phase-end', 'execute'],
    ['completed', undefined],
  ])
  const enqueued = entries.find(entry => entry.event === 'drop-enqueued')
  assert.equal(enqueued?.dropId, attachmentId)
  assert.equal(enqueued?.recipients, 3)
  assert.equal(entries.at(-1)?.enqueued, true)
  assert.equal(entries.at(-1)?.failed, false)
  assert.ok(entries.filter(entry => entry.event === 'phase-end')
    .every(entry => typeof entry.durationMs === 'number' && entry.durationMs >= 0))
})

test('an expired initial acknowledgment cannot enqueue a drop or leak SDK error secrets', async context => {
  const fixture = createFixture(context, {
    diagnosticsEnabled: true,
    acknowledge: async () => { throw unknownInteractionError() },
  })

  await fixture.run()
  assert.equal(fixture.broadcastDrop.mock.callCount(), 0)
  assert.equal(fixture.reply.mock.callCount(), 0)
  const entries = fixture.entries()
  const failure = entries.find(entry => entry.event === 'phase-error')
  assert.equal(failure?.phase, 'ack')
  assert.equal(failure?.code, 10062)
  assert.equal(failure?.status, 404)
  assert.ok(entries.some(entry => entry.event === 'error' && entry.code === 10062))
  assert.equal(entries.at(-1)?.event, 'completed')
  assert.equal(entries.at(-1)?.enqueued, false)
  assert.equal(entries.at(-1)?.failed, true)
  assert.doesNotMatch(JSON.stringify(fixture.output), /private-|https:\/\/|requestBody|authorization/)
})

test('a failed final reply records the existing enqueue without sending another drop', async context => {
  const fixture = createFixture(context, {
    diagnosticsEnabled: true,
    reply: async () => { throw unknownInteractionError() },
  })

  await fixture.run()
  assert.equal(fixture.acknowledge.mock.callCount(), 1)
  assert.equal(fixture.broadcastDrop.mock.callCount(), 1)
  assert.equal(fixture.reply.mock.callCount(), 1)
  const entries = fixture.entries()
  assert.equal(entries.filter(entry => entry.event === 'drop-enqueued').length, 1)
  assert.ok(entries.some(entry => entry.event === 'phase-error'
    && entry.phase === 'reply' && entry.code === 10062))
  assert.ok(entries.some(entry => entry.event === 'error' && entry.code === 10062))
  assert.equal(entries.at(-1)?.event, 'completed')
  assert.equal(entries.at(-1)?.enqueued, true)
  assert.equal(entries.at(-1)?.failed, true)
  const output = JSON.stringify(fixture.output)
  assert.match(output, /Erreur après acquittement initial/)
  assert.doesNotMatch(output, /Le drop n'a pas été ajouté|private-|https:\/\/|requestBody|authorization/)
})

test('drop diagnostics are disabled by default without affecting normal delivery', async context => {
  const fixture = createFixture(context)

  await fixture.run()
  assert.equal(fixture.acknowledge.mock.callCount(), 1)
  assert.equal(fixture.broadcastDrop.mock.callCount(), 1)
  assert.equal(fixture.reply.mock.callCount(), 1)
  assert.deepEqual(fixture.entries(), [])
})
