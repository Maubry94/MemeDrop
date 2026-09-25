import { AsyncLocalStorage } from 'node:async_hooks'
import { performance } from 'node:perf_hooks'
import type { ChatInputCommandInteraction } from 'discord.js'

type Phase = 'ack' | 'execute' | 'reply'
type Fields = Record<string, string | number | boolean | null>
type DiagnosticInteraction = Pick<
  ChatInputCommandInteraction,
  'id' | 'commandName' | 'createdTimestamp' | 'options'
>

type Trace = {
  interactionId: string | null
  command: string | null
  started: number
  now: () => number
  wallNow: () => number
  logger: (line: string) => void
  closed: boolean
  failed: boolean
  enqueued: boolean
}

const context = new AsyncLocalStorage<{ trace: Trace; phase?: Phase }>()
const safeId = (value: unknown) =>
  typeof value === 'string' && /^\d{16,20}$/.test(value) ? value : null
const safeNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null
const elapsed = (trace: Trace) => Math.round((trace.now() - trace.started) * 10) / 10

const emit = (event: string, fields: Fields = {}) => {
  const current = context.getStore()
  if (!current || current.trace.closed) return
  const { trace, phase } = current
  // Never pass SDK requests, errors, headers, URLs, user text or tokens to this
  // sink. The caller supplies only allowlisted scalar diagnostics.
  try {
    trace.logger(`[discord-diag] ${JSON.stringify({
      at: new Date(trace.wallNow()).toISOString(),
      interactionId: trace.interactionId,
      command: trace.command,
      event,
      ...(phase ? { phase } : {}),
      elapsedMs: elapsed(trace),
      ...fields,
    })}`)
  } catch {
    // A failing diagnostic sink must not prevent an interaction or a drop.
  }
}

export const getDiscordErrorDetails = (error: unknown) => {
  const value = error && typeof error === 'object'
    ? error as { name?: unknown; code?: unknown; status?: unknown; cause?: { code?: unknown } }
    : {}
  const code = value.code ?? value.cause?.code
  const transportCodes = new Set([
    'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
    'UND_ERR_SOCKET', 'ABORT_ERR',
  ])
  return {
    name: typeof value.name === 'string'
      && ['Error', 'TypeError', 'AbortError', 'TimeoutError', 'DiscordAPIError', 'HTTPError'].includes(value.name)
      ? value.name : null,
    code: typeof code === 'number' && Number.isSafeInteger(code)
      ? code
      : typeof code === 'string' && transportCodes.has(code) ? code : null,
    status: safeNumber(value.status),
  }
}

export const logDiscordFailure = (error: unknown) => {
  const current = context.getStore()
  if (current) current.trace.failed = true
  emit('error', getDiscordErrorDetails(error))
}

export const runWithDiscordDiagnostics = async <T>(
  interaction: DiagnosticInteraction,
  task: () => Promise<T>,
  options: {
    logger?: (line: string) => void
    now?: () => number
    wallNow?: () => number
  } = {},
): Promise<T> => {
  const now = options.now ?? (() => performance.now())
  const wallNow = options.wallNow ?? Date.now
  const receivedAt = wallNow()
  const trace: Trace = {
    interactionId: safeId(interaction.id),
    command: /^[a-z0-9_-]{1,32}$/.test(interaction.commandName) ? interaction.commandName : null,
    started: now(), now, wallNow,
    logger: options.logger ?? ((line) => console.log(line)),
    closed: false, failed: false, enqueued: false,
  }
  return context.run({ trace }, async () => {
    let attachment: ReturnType<DiagnosticInteraction['options']['getAttachment']> | null = null
    try {
      if (interaction.commandName === 'drop' || interaction.commandName === 'dropme') {
        attachment = interaction.options.getAttachment('fichier')
      }
    } catch {
      // Metadata is optional for diagnostics; command validation still runs.
    }
    const attachmentId = safeId(attachment?.id)
    const attachmentCreatedAt = attachmentId
      ? Number((BigInt(attachmentId) >> 22n) + 1420070400000n) : null
    const createdAt = safeNumber(interaction.createdTimestamp)
    emit('received', {
      // These are wall-clock ages, not upload durations or time since the user
      // clicked Send. Negative values can also reveal clock skew on the host.
      ageMs: createdAt === null ? null : receivedAt - createdAt,
      attachmentId,
      attachmentAgeMs: attachmentCreatedAt === null ? null : receivedAt - attachmentCreatedAt,
      attachmentBytes: safeNumber(attachment?.size),
    })
    try {
      return await task()
    } catch (error) {
      logDiscordFailure(error)
      throw error
    } finally {
      emit('completed', { failed: trace.failed, enqueued: trace.enqueued })
      trace.closed = true
    }
  })
}

export const measureDiscordPhase = async <T>(phase: Phase, task: () => Promise<T>): Promise<T> => {
  const current = context.getStore()
  if (!current) return task()
  return context.run({ trace: current.trace, phase }, async () => {
    const started = current.trace.now()
    emit('phase-start')
    try {
      const result = await task()
      emit('phase-end', { durationMs: Math.round((current.trace.now() - started) * 10) / 10 })
      return result
    } catch (error) {
      current.trace.failed = true
      emit('phase-error', {
        durationMs: Math.round((current.trace.now() - started) * 10) / 10,
        ...getDiscordErrorDetails(error),
      })
      throw error
    }
  })
}

export const logDropEnqueued = (dropId: string, recipients: number) => {
  const current = context.getStore()
  if (!current) return
  if (current && recipients > 0) current.trace.enqueued = true
  emit(recipients > 0 ? 'drop-enqueued' : 'drop-rejected', {
    dropId: /^[a-zA-Z0-9_-]{1,128}$/.test(dropId) ? dropId : null,
    recipients: safeNumber(recipients),
  })
}

export const logDiscordRestResponse = (response: {
  route: 'interaction-callback' | 'original-response'
  method: 'POST' | 'PATCH'
  status: number
  retries: number
  retryAfterMs?: number
}) => {
  // Capture all callback/reply responses, including a 429 handled and retried
  // internally by discord.js without its usual rateLimited event.
  emit('rest-response', {
    route: response.route,
    method: response.method,
    status: safeNumber(response.status),
    retries: safeNumber(response.retries),
    retryAfterMs: safeNumber(response.retryAfterMs),
  })
}
