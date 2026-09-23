import type { Drop, DropCompletionReason } from '@memedrop/protocol'

const DEFAULT_IMAGE_SAFETY_TIMEOUT_MS = 60 * 1000
// This absolute ceiling remains a last resort when no client reports a normal
// end. A normal completion starts the much shorter collective catch-up window.
const DEFAULT_MEDIA_SAFETY_TIMEOUT_MS = 6 * 60 * 60 * 1000
const DEFAULT_COMPLETION_GRACE_MS = 3 * 1000

type DropScope = 'global' | 'targeted'

type DropJob<TTarget> = {
  drop: Drop
  targets: Set<TTarget>
  pending: Set<TTarget>
  scope: DropScope
  targetUserId: string | null
  safetyTimer: ReturnType<typeof setTimeout> | null
  completionTimer: ReturnType<typeof setTimeout> | null
  starting: boolean
}

type DropSchedulerLogger = Pick<Console, 'log' | 'warn'>

type DropSchedulerOptions<TTarget> = {
  getEligibleTargets: () => TTarget[]
  getTargetsByUserId: (userId: string) => TTarget[]
  sendDrop: (target: TTarget, drop: Drop) => void
  sendClear: (target: TTarget) => void
  getLogSummary?: () => string
  getTargetLogLabel?: (target: TTarget) => string
  imageSafetyTimeoutMs?: number
  mediaSafetyTimeoutMs?: number
  completionGraceMs?: number
  logger?: DropSchedulerLogger
}

const MAX_GLOBAL_QUEUE_LENGTH = 100
const MAX_TARGETED_QUEUE_LENGTH = 25

export const createDropScheduler = <TTarget>({
  getEligibleTargets,
  getTargetsByUserId,
  sendDrop,
  sendClear,
  getLogSummary = () => '',
  getTargetLogLabel = () => 'un client',
  imageSafetyTimeoutMs = DEFAULT_IMAGE_SAFETY_TIMEOUT_MS,
  mediaSafetyTimeoutMs = DEFAULT_MEDIA_SAFETY_TIMEOUT_MS,
  completionGraceMs = DEFAULT_COMPLETION_GRACE_MS,
  logger = console,
}: DropSchedulerOptions<TTarget>) => {
  const queuedJobs: DropJob<TTarget>[] = []
  const jobs = new Set<DropJob<TTarget>>()
  // Completed recipients remain reserved until the whole group advances. They
  // must never start the next drop while another recipient still watches this one.
  const activeJobByTarget = new Map<TTarget, DropJob<TTarget>>()
  let activeGlobalJob: DropJob<TTarget> | null = null
  let scheduling = false
  let scheduleAgain = false

  const safelySendClear = (target: TTarget, dropId: string) => {
    try {
      sendClear(target)
    } catch (error) {
      logger.warn(
        `Nettoyage du drop ${dropId} impossible pour ${getTargetLogLabel(target)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  const getDeliveryTargetsForDrop = (drop: Drop) => {
    if (!drop.targetUserId) {
      return Array.from(new Set(getEligibleTargets()))
    }

    const targets = getTargetsByUserId(drop.targetUserId)
    // Do not play a targeted drop only to its author's mirror after the actual
    // recipient has disconnected or disabled reception.
    if (!targets.length) {
      return []
    }
    const ownerId = drop.ownerId ?? drop.authorId
    return Array.from(
      new Set(
        ownerId && ownerId !== drop.targetUserId
          ? [...targets, ...getTargetsByUserId(ownerId)]
          : targets,
      ),
    )
  }

  const clearJobTimers = (job: DropJob<TTarget>) => {
    if (job.safetyTimer) {
      clearTimeout(job.safetyTimer)
      job.safetyTimer = null
    }
    if (job.completionTimer) {
      clearTimeout(job.completionTimer)
      job.completionTimer = null
    }
  }

  const finishJob = (job: DropJob<TTarget>, clearTargets = true) => {
    if (!jobs.delete(job)) {
      return
    }
    if (activeGlobalJob === job) {
      activeGlobalJob = null
    }
    clearJobTimers(job)
    const queueIndex = queuedJobs.indexOf(job)
    if (queueIndex !== -1) {
      queuedJobs.splice(queueIndex, 1)
    }

    for (const target of job.targets) {
      if (activeJobByTarget.get(target) !== job) {
        continue
      }
      if (clearTargets) {
        safelySendClear(target, job.drop.id)
      }
      activeJobByTarget.delete(target)
    }
    job.pending.clear()

    logger.log(
      job.scope === 'targeted'
        ? `Drop ciblé terminé pour ${job.drop.targetUserName ?? job.targetUserId}: ${job.drop.id}.`
        : `Drop global terminé chez tous les clients actifs: ${job.drop.id}.`,
    )
  }

  const getSafetyTimeoutMs = (drop: Drop) => {
    const contentType = drop.contentType?.toLowerCase() ?? ''
    return contentType.startsWith('image/')
      ? imageSafetyTimeoutMs
      : mediaSafetyTimeoutMs
  }

  const startJob = (job: DropJob<TTarget>, targets: TTarget[]) => {
    job.targets = new Set(targets)
    job.pending = new Set(targets)
    job.starting = true
    if (job.scope === 'global') {
      activeGlobalJob = job
    }
    for (const target of targets) {
      activeJobByTarget.set(target, job)
    }

    job.safetyTimer = setTimeout(() => {
      if (!jobs.has(job)) {
        return
      }
      logger.warn(
        `Drop ${job.drop.id} libéré par timeout collectif (${job.pending.size} cible(s) encore en attente).`,
      )
      finishJob(job, true)
      scheduleDrops()
    }, getSafetyTimeoutMs(job.drop))
    job.safetyTimer.unref()

    for (const target of targets) {
      // A synchronous callback can remove a recipient or cancel this job.
      if (!jobs.has(job) || !job.pending.has(target)) {
        continue
      }
      try {
        sendDrop(target, job.drop)
      } catch (error) {
        logger.warn(
          `Envoi du drop ${job.drop.id} impossible pour ${getTargetLogLabel(target)}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
        job.pending.delete(target)
      }
    }
    job.starting = false
    if (!job.pending.size) {
      finishJob(job)
      scheduleAgain = true
    }
  }

  const scheduleDrops = () => {
    if (scheduling) {
      scheduleAgain = true
      return
    }
    scheduling = true
    try {
      do {
        scheduleAgain = false
        const blockedTargets = new Set<TTarget>()
        for (const job of [...queuedJobs]) {
          // A global drop also reserves the collective timeline for newcomers
          // who were not ready when it started. They join only the next drop.
          if (activeGlobalJob) {
            break
          }
          if (!jobs.has(job)) {
            continue
          }
          // Resolve at launch so ready newcomers and replacement connections
          // join the next collective drop rather than replaying the active one.
          const targets = getDeliveryTargetsForDrop(job.drop)
          if (!targets.length) {
            finishJob(job)
            continue
          }
          if (
            targets.some(
              (target) => activeJobByTarget.has(target) || blockedTargets.has(target),
            )
          ) {
            for (const target of targets) {
              blockedTargets.add(target)
            }
            continue
          }
          queuedJobs.splice(queuedJobs.indexOf(job), 1)
          startJob(job, targets)
        }
      } while (scheduleAgain)
    } finally {
      scheduling = false
    }
  }

  const enqueueDrop = (drop: Drop) => {
    const scope: DropScope = drop.targetUserId ? 'targeted' : 'global'
    const targetUserId = drop.targetUserId ?? null
    const maximumQueueLength =
      scope === 'global' ? MAX_GLOBAL_QUEUE_LENGTH : MAX_TARGETED_QUEUE_LENGTH
    const queueLength = queuedJobs.filter(
      (job) => job.scope === scope && job.targetUserId === targetUserId,
    ).length
    if (queueLength >= maximumQueueLength) {
      logger.warn(
        scope === 'global'
          ? 'Drop refusé: queue globale pleine.'
          : `Drop refusé: queue ciblée pleine pour ${targetUserId}.`,
      )
      return 0
    }

    const targets = getDeliveryTargetsForDrop(drop)
    if (!targets.length) {
      return 0
    }
    const primaryTargets = targetUserId
      ? new Set(getTargetsByUserId(targetUserId))
      : new Set(targets)
    const recipientCount = targets.filter((target) => primaryTargets.has(target)).length
    const job: DropJob<TTarget> = {
      drop,
      targets: new Set(),
      pending: new Set(),
      scope,
      targetUserId,
      safetyTimer: null,
      completionTimer: null,
      starting: false,
    }
    jobs.add(job)
    queuedJobs.push(job)
    const logSummary = getLogSummary()
    logger.log(
      `Drop planifié: ${drop.id} (${targets.length} client(s) ciblé(s)${
        logSummary ? `, ${logSummary}` : ''
      }).`,
    )
    scheduleDrops()
    return recipientCount
  }

  const completeDropForTarget = (
    target: TTarget,
    dropId: string,
    reason?: DropCompletionReason,
  ) => {
    const job = activeJobByTarget.get(target)
    if (!job || !jobs.has(job) || job.drop.id !== dropId || !job.pending.delete(target)) {
      return
    }

    // Keep each recipient's server snapshot and reservation until the whole
    // group finishes. The desktop hides its local presentation on completion,
    // while its author can still stop the drop for viewers who are watching it.
    logger.log(
      `Drop acquitté par ${getTargetLogLabel(target)}: ${dropId} (${reason ?? 'legacy'}, ${job.pending.size} cible(s) encore en attente).`,
    )
    if (!job.pending.size && !job.starting) {
      finishJob(job)
      scheduleDrops()
      return
    }

    // A skipped/error/timeout (or old client) acknowledgement says nothing about
    // the media duration and must not cut off the other viewers.
    if (reason === 'ended' && job.pending.size && !job.completionTimer) {
      job.completionTimer = setTimeout(() => {
        if (!jobs.has(job)) {
          return
        }
        logger.warn(
          `Drop ${dropId}: rattrapage collectif après fin normale (${job.pending.size} cible(s) retardataire(s)).`,
        )
        finishJob(job, true)
        scheduleDrops()
      }, completionGraceMs)
      job.completionTimer.unref()
    }
  }

  const removeTarget = (target: TTarget) => {
    const job = activeJobByTarget.get(target)
    if (job) {
      activeJobByTarget.delete(target)
      job.targets.delete(target)
      job.pending.delete(target)
      if (!job.pending.size && !job.starting) {
        finishJob(job)
      }
    }
    scheduleDrops()
  }

  const replaceTarget = (target: TTarget, replacement: TTarget) => {
    if (target === replacement) {
      return
    }
    logger.log('Connexion remplacée: le nouvel appareil rejoindra le prochain drop collectif.')
    removeTarget(target)
  }

  const stopDropByOwner = (
    dropId: string,
    ownerId: string,
    options: { sendClear?: boolean } = {},
  ) => {
    const job = [...jobs].find((candidate) => candidate.drop.id === dropId)
    if (!job) {
      return false
    }
    const expectedOwnerId = job.drop.ownerId ?? job.drop.authorId
    if (expectedOwnerId !== ownerId) {
      logger.warn(`Stop global refusé pour ${ownerId}: auteur attendu ${expectedOwnerId}.`)
      return false
    }
    finishJob(job, options.sendClear ?? true)
    logger.log(`Drop stoppé globalement par l'auteur: ${dropId}.`)
    scheduleDrops()
    return true
  }

  return {
    completeDropForTarget,
    enqueueDrop,
    removeTarget,
    replaceTarget,
    scheduleDrops,
    stopDropByOwner,
  }
}
