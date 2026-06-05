import type { Drop } from '../shared/types.js'

const DEFAULT_IMAGE_DISPLAY_MS = 9000

type DropScope = 'global' | 'targeted'

type DropJob<TTarget> = {
  drop: Drop
  targets: Set<TTarget>
  done: Set<TTarget>
  scope: DropScope
  targetUserId: string | null
  timer: ReturnType<typeof setTimeout> | null
}

type DropSchedulerLogger = Pick<Console, 'log' | 'warn'>

type DropSchedulerOptions<TTarget> = {
  getEligibleTargets: () => TTarget[]
  getTargetsByUserId: (userId: string) => TTarget[]
  sendDrop: (target: TTarget, drop: Drop) => void
  sendClear: (target: TTarget) => void
  getLogSummary?: () => string
  imageDisplayMs?: number
  logger?: DropSchedulerLogger
}

export const createDropScheduler = <TTarget>({
  getEligibleTargets,
  getTargetsByUserId,
  sendDrop,
  sendClear,
  getLogSummary = () => '',
  imageDisplayMs = DEFAULT_IMAGE_DISPLAY_MS,
  logger = console,
}: DropSchedulerOptions<TTarget>) => {
  const globalQueue: Drop[] = []
  const targetedQueues = new Map<string, Drop[]>()
  const activeJobByTarget = new Map<TTarget, DropJob<TTarget>>()
  const activeTargetJobs = new Map<string, DropJob<TTarget>>()
  let activeGlobalJob: DropJob<TTarget> | null = null

  const clearJobTimer = (job: DropJob<TTarget>) => {
    if (job.timer) {
      clearTimeout(job.timer)
      job.timer = null
    }
  }

  const getDeliveryTargetsForDrop = (drop: Drop) => {
    if (!drop.targetUserId) {
      return getEligibleTargets()
    }

    const targets = getTargetsByUserId(drop.targetUserId)
    const ownerId = drop.ownerId ?? drop.authorId

    if (!ownerId || ownerId === drop.targetUserId) {
      return targets
    }

    return Array.from(new Set([...targets, ...getTargetsByUserId(ownerId)]))
  }

  const hasBusyTarget = (targets: TTarget[]) =>
    targets.some((target) => activeJobByTarget.has(target))

  const sendClearToTargets = (job: DropJob<TTarget>) => {
    for (const target of job.targets) {
      sendClear(target)
    }
  }

  const finishJob = (job: DropJob<TTarget>, options: { sendClear?: boolean } = {}) => {
    clearJobTimer(job)

    if (options.sendClear) {
      sendClearToTargets(job)
    }

    for (const target of job.targets) {
      activeJobByTarget.delete(target)
    }

    if (job.scope === 'global') {
      activeGlobalJob = null
    } else if (job.targetUserId) {
      activeTargetJobs.delete(job.targetUserId)
    }

    scheduleDrops()
  }

  const startJob = (drop: Drop, targets: TTarget[], scope: DropScope) => {
    const job: DropJob<TTarget> = {
      drop,
      targets: new Set(targets),
      done: new Set(),
      scope,
      targetUserId: drop.targetUserId ?? null,
      timer: null,
    }

    if (scope === 'global') {
      activeGlobalJob = job
    } else if (job.targetUserId) {
      activeTargetJobs.set(job.targetUserId, job)
    }

    for (const target of targets) {
      activeJobByTarget.set(target, job)
      sendDrop(target, drop)
    }

    const logSummary = getLogSummary()
    logger.log(
      `Drop actif: ${drop.id} (${targets.length} client(s) ciblé(s)${
        logSummary ? `, ${logSummary}` : ''
      }).`,
    )

    const contentType = drop.contentType?.toLowerCase() ?? ''
    if (contentType.startsWith('image/')) {
      job.timer = setTimeout(() => {
        logger.log(`Drop image terminé par timeout: ${drop.id}.`)
        finishJob(job, { sendClear: false })
      }, imageDisplayMs)
    }

    return job
  }

  function scheduleDrops() {
    if (activeGlobalJob) {
      return
    }

    const eligibleTargets = getEligibleTargets()
    const busyTargetExists = eligibleTargets.some((target) => activeJobByTarget.has(target))

    if (globalQueue.length && !eligibleTargets.length) {
      globalQueue.length = 0
      return
    }

    if (globalQueue.length && eligibleTargets.length && !busyTargetExists) {
      const nextDrop = globalQueue.shift()
      if (nextDrop) {
        startJob(nextDrop, eligibleTargets, 'global')
      }
      return
    }

    if (globalQueue.length) {
      return
    }

    for (const [targetUserId, queue] of targetedQueues.entries()) {
      if (!queue.length || activeTargetJobs.has(targetUserId)) {
        continue
      }

      const primaryTargets = getTargetsByUserId(targetUserId)
      if (!primaryTargets.length) {
        queue.shift()
        if (!queue.length) {
          targetedQueues.delete(targetUserId)
        }
        continue
      }

      const nextDrop = queue[0]
      if (!nextDrop) {
        targetedQueues.delete(targetUserId)
        continue
      }

      const deliveryTargets = getDeliveryTargetsForDrop(nextDrop)

      if (hasBusyTarget(deliveryTargets)) {
        continue
      }

      queue.shift()
      startJob(nextDrop, deliveryTargets, 'targeted')
      if (!queue.length) {
        targetedQueues.delete(targetUserId)
      }
    }
  }

  const enqueueDrop = (drop: Drop) => {
    if (drop.targetUserId) {
      const sentCount = getTargetsByUserId(drop.targetUserId).length
      if (!sentCount) {
        return 0
      }

      const queue = targetedQueues.get(drop.targetUserId) ?? []
      queue.push(drop)
      targetedQueues.set(drop.targetUserId, queue)
      scheduleDrops()
      return sentCount
    }

    const sentCount = getEligibleTargets().length
    if (!sentCount) {
      return 0
    }

    globalQueue.push(drop)
    scheduleDrops()
    return sentCount
  }

  const completeDropForTarget = (target: TTarget, dropId: string) => {
    const job = activeJobByTarget.get(target)
    if (!job || job.drop.id !== dropId) {
      return
    }

    job.done.add(target)
    if (job.done.size >= job.targets.size) {
      if (job.scope === 'targeted') {
        const targetLabel = job.drop.targetUserName ?? job.targetUserId ?? 'la cible'
        logger.log(`Drop ciblé terminé pour ${targetLabel}: ${dropId}.`)
      } else {
        logger.log(`Drop global terminé chez tous les clients: ${dropId}.`)
      }
      finishJob(job, { sendClear: false })
    }
  }

  const removeTarget = (target: TTarget) => {
    const job = activeJobByTarget.get(target)
    if (!job) {
      scheduleDrops()
      return
    }

    activeJobByTarget.delete(target)
    job.targets.delete(target)
    job.done.delete(target)

    if (!job.targets.size) {
      logger.log(`Drop annulé: plus aucun client cible (${job.drop.id}).`)
      finishJob(job, { sendClear: false })
    } else if (job.done.size >= job.targets.size) {
      finishJob(job, { sendClear: false })
    } else {
      scheduleDrops()
    }
  }

  const stopDropByOwner = (
    dropId: string,
    ownerId: string,
    options: { sendClear?: boolean } = {},
  ) => {
    const jobs = [activeGlobalJob, ...activeTargetJobs.values()].filter(
      (job): job is DropJob<TTarget> => Boolean(job),
    )
    const job = jobs.find((activeJob) => activeJob.drop.id === dropId)

    if (job) {
      const expectedOwnerId = job.drop.ownerId ?? job.drop.authorId
      if (expectedOwnerId !== ownerId) {
        logger.warn(`Stop global refusé pour ${ownerId}: auteur attendu ${expectedOwnerId}.`)
        return false
      }

      logger.log(`Drop stoppé globalement par l'auteur: ${dropId}.`)
      finishJob(job, { sendClear: options.sendClear ?? true })
      return true
    }

    const removeFromQueue = (queue: Drop[]) => {
      const index = queue.findIndex((drop) => drop.id === dropId)
      if (index === -1) {
        return false
      }

      const drop = queue[index]
      if (!drop) {
        return false
      }

      const expectedOwnerId = drop.ownerId ?? drop.authorId
      if (expectedOwnerId !== ownerId) {
        logger.warn(`Stop global refusé pour ${ownerId}: auteur attendu ${expectedOwnerId}.`)
        return false
      }

      queue.splice(index, 1)
      return true
    }

    if (removeFromQueue(globalQueue)) {
      return true
    }

    for (const [targetUserId, queue] of targetedQueues.entries()) {
      if (removeFromQueue(queue)) {
        if (!queue.length) {
          targetedQueues.delete(targetUserId)
        }
        return true
      }
    }

    return false
  }

  return {
    completeDropForTarget,
    enqueueDrop,
    removeTarget,
    scheduleDrops,
    stopDropByOwner,
  }
}
