import type { DropCompletionReason, MemeDropClientMessage } from '@memedrop/protocol'

const DROP_ID_PATTERN = /^[A-Za-z0-9_-]{1,512}$/

const isCompletionReason = (value: unknown): value is DropCompletionReason =>
  value === 'ended' || value === 'skipped' || value === 'error' || value === 'timeout'

const hasExactKeys = (value: Record<string, unknown>, expectedKeys: string[]) => {
  const keys = Object.keys(value).sort()
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index])
}

export const parseClientMessage = (text: string): MemeDropClientMessage | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }

  const message = parsed as Record<string, unknown>
  if (message.type === 'drop-completed' || message.type === 'drop-stop') {
    const hasReason = message.type === 'drop-completed' && 'reason' in message
    if (
      !hasExactKeys(message, hasReason ? ['dropId', 'reason', 'type'] : ['dropId', 'type']) ||
      typeof message.dropId !== 'string' ||
      !DROP_ID_PATTERN.test(message.dropId) ||
      (hasReason && !isCompletionReason(message.reason))
    ) {
      return null
    }

    if (message.type === 'drop-completed' && isCompletionReason(message.reason)) {
      return { type: 'drop-completed', dropId: message.dropId, reason: message.reason }
    }

    return {
      type: message.type,
      dropId: message.dropId,
    }
  }

  if (
    message.type === 'client-state' &&
    hasExactKeys(message, ['dropsEnabled', 'type']) &&
    typeof message.dropsEnabled === 'boolean'
  ) {
    return {
      type: 'client-state',
      dropsEnabled: message.dropsEnabled,
    }
  }

  return null
}
