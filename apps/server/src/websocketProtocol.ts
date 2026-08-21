import type { MemeDropClientMessage } from '@memedrop/protocol'

const DROP_ID_PATTERN = /^[A-Za-z0-9_-]{1,512}$/

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
    if (
      !hasExactKeys(message, ['dropId', 'type']) ||
      typeof message.dropId !== 'string' ||
      !DROP_ID_PATTERN.test(message.dropId)
    ) {
      return null
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
