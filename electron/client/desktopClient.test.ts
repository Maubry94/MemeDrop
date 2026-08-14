import assert from 'node:assert/strict'
import test from 'node:test'
import type { ConnectedUser, ConnectionStatus, Drop, ServerConnectionConfig } from '../../shared/types.ts'
import { createDesktopClient } from './desktopClient.ts'
import type {
  MemeDropClientController,
  MemeDropClientRuntime,
} from './memedropClient.ts'

type ClientCallbacks = Parameters<NonNullable<Parameters<typeof createDesktopClient>[0]['startClient']>>[0]

const createDrop = (id: string, ownerId = 'other-user'): Drop => ({
  id,
  url: `https://cdn.discordapp.com/${id}`,
  contentType: 'image/png',
  fileName: `${id}.png`,
  caption: null,
  authorId: ownerId,
  ownerId,
  author: 'Author',
  authorAvatarUrl: null,
  createdAt: new Date(0).toISOString(),
})

const createHarness = () => {
  const callbacks: ClientCallbacks[] = []
  const controllers: Array<
    MemeDropClientController & { completeAccepted: boolean; stopAccepted: boolean }
  > = []
  const presented: Drop[] = []
  const controlOnly: Drop[] = []
  const connectedUsersSnapshots: ConnectedUser[][] = []
  const statuses: ConnectionStatus[] = []
  const stoppedDropIds: string[] = []
  let clears = 0
  let incoming = 0
  let rejected = 0
  let hideOwnDrops = false
  let dropsEnabled = true

  const serverConfig: ServerConnectionConfig = {
    serverUrl: 'http://127.0.0.1:3010',
    accessKey: 'test-key',
    discordUserId: '123456789012345678',
    discordUserName: 'User',
    discordUserAvatarUrl: null,
    authToken: 'test-token',
    authTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  }

  const startClient = ((options: ClientCallbacks) => {
    callbacks.push(options)
    const controller: MemeDropClientController & {
      completeAccepted: boolean
      stopAccepted: boolean
    } = {
      completeAccepted: true,
      stopAccepted: true,
      completeDrop: () => controller.completeAccepted,
      stopDrop: (dropId) => {
        stoppedDropIds.push(dropId)
        return controller.stopAccepted
      },
      updateDropsEnabled: () => true,
      stop: () => undefined,
    }
    controllers.push(controller)
    return controller
  }) as (options: ClientCallbacks, runtime?: MemeDropClientRuntime) => MemeDropClientController

  const desktop = createDesktopClient({
    getServerConfig: () => serverConfig,
    getAppVersion: () => '3.0.7',
    getDropsEnabled: () => dropsEnabled,
    getHideOwnDrops: () => hideOwnDrops,
    onConnectedUsers: (users) => connectedUsersSnapshots.push(users),
    onAppVersionInfo: () => undefined,
    onIncomingDrop: () => {
      incoming += 1
    },
    onDrop: (drop) => presented.push(drop),
    onControlOnlyDrop: (drop) => controlOnly.push(drop),
    onClearDrop: () => {
      clears += 1
    },
    onStatus: (status) => statuses.push(status),
    onAuthenticationRejected: () => {
      rejected += 1
    },
    startClient,
  })

  return {
    desktop,
    callbacks,
    controllers,
    presented,
    controlOnly,
    connectedUsersSnapshots,
    statuses,
    stoppedDropIds,
    setHideOwnDrops: (value: boolean) => {
      hideOwnDrops = value
    },
    setDropsEnabled: (value: boolean) => {
      dropsEnabled = value
    },
    get clears() {
      return clears
    },
    get incoming() {
      return incoming
    },
    get rejected() {
      return rejected
    },
  }
}

test('desktop snapshots separate presented and server drops across acknowledgement and clear', () => {
  const harness = createHarness()
  harness.desktop.startOrRestart()
  const callbacks = harness.callbacks[0]
  const controller = harness.controllers[0]
  assert.ok(callbacks)
  assert.ok(controller)

  const drop = createDrop('drop-a')
  callbacks.onDrop(drop)
  assert.deepEqual(harness.desktop.getPresentedDrop(), drop)
  assert.deepEqual(harness.desktop.getCurrentDrop(), drop)
  assert.equal(harness.desktop.getCurrentDropId(), 'drop-a')

  controller.completeAccepted = false
  const clearsBeforeAck = harness.clears
  assert.equal(harness.desktop.completeDrop('drop-a'), false)
  assert.deepEqual(harness.desktop.getPresentedDrop(), drop)
  assert.deepEqual(harness.desktop.getCurrentDrop(), drop)
  assert.equal(harness.clears, clearsBeforeAck)

  controller.completeAccepted = true
  assert.equal(harness.desktop.completeDrop('drop-a'), true)
  assert.equal(harness.desktop.getPresentedDrop(), null)
  assert.deepEqual(harness.desktop.getCurrentDrop(), drop)
  assert.equal(harness.desktop.getCurrentDropId(), 'drop-a')
  assert.equal(harness.clears, clearsBeforeAck)

  callbacks.onClearDrop()
  assert.equal(harness.desktop.getPresentedDrop(), null)
  assert.equal(harness.desktop.getCurrentDrop(), null)
  assert.equal(harness.desktop.getCurrentDropId(), null)
})

test('hidden own drops remain stoppable until the authoritative server clear', () => {
  const harness = createHarness()
  harness.setHideOwnDrops(true)
  harness.desktop.startOrRestart()
  const callbacks = harness.callbacks[0]
  assert.ok(callbacks)

  const ownDrop = createDrop('own-drop', '123456789012345678')
  callbacks.onDrop(ownDrop)

  assert.deepEqual(harness.controlOnly, [ownDrop])
  assert.equal(harness.desktop.getPresentedDrop(), null)
  assert.deepEqual(harness.desktop.getCurrentDrop(), ownDrop)
  assert.equal(harness.desktop.completeDrop('own-drop'), true)
  assert.deepEqual(harness.desktop.getCurrentDrop(), ownDrop)
  assert.equal(harness.desktop.stopCurrentDropForEveryone(), true)
  assert.deepEqual(harness.stoppedDropIds, ['own-drop'])

  callbacks.onClearDrop()
  assert.equal(harness.desktop.getCurrentDrop(), null)
})

test('global stop reports whether the current drop stop was sent', () => {
  const harness = createHarness()

  assert.equal(harness.desktop.stopCurrentDropForEveryone(), false)

  harness.desktop.startOrRestart()
  const callbacks = harness.callbacks[0]
  const controller = harness.controllers[0]
  assert.ok(callbacks)
  assert.ok(controller)

  callbacks.onDrop(createDrop('drop-to-stop'))
  controller.stopAccepted = false

  assert.equal(harness.desktop.stopCurrentDropForEveryone('another-drop'), false)
  assert.deepEqual(harness.stoppedDropIds, [])
  assert.equal(harness.desktop.stopCurrentDropForEveryone(), false)
  assert.deepEqual(harness.stoppedDropIds, ['drop-to-stop'])

  controller.stopAccepted = true
  assert.equal(harness.desktop.stopCurrentDropForEveryone(), true)
  assert.deepEqual(harness.stoppedDropIds, ['drop-to-stop', 'drop-to-stop'])
})

test('callbacks from an obsolete client generation cannot mutate desktop snapshots', () => {
  const harness = createHarness()
  harness.desktop.startOrRestart()
  const staleCallbacks = harness.callbacks[0]
  assert.ok(staleCallbacks)

  harness.desktop.startOrRestart()
  const currentCallbacks = harness.callbacks[1]
  assert.ok(currentCallbacks)

  staleCallbacks.onDrop(createDrop('stale'))
  staleCallbacks.onConnectedUsers([], '99.0.0')
  staleCallbacks.onStatus({
    state: 'error',
    reason: 'transport-error',
    level: 'error',
    message: 'stale status',
  })
  staleCallbacks.onAuthenticationRejected()

  assert.equal(harness.desktop.getCurrentDrop(), null)
  assert.equal(harness.presented.length, 0)
  assert.equal(harness.statuses.length, 0)
  assert.equal(harness.rejected, 0)

  const currentDrop = createDrop('current')
  currentCallbacks.onDrop(currentDrop)
  staleCallbacks.onClearDrop()
  assert.deepEqual(harness.desktop.getCurrentDrop(), currentDrop)
  assert.equal(harness.incoming, 1)
})

test('disabled drops are acknowledged without becoming presented snapshots', () => {
  const harness = createHarness()
  harness.setDropsEnabled(false)
  harness.desktop.startOrRestart()
  const callbacks = harness.callbacks[0]
  assert.ok(callbacks)

  callbacks.onDrop(createDrop('disabled'))

  assert.equal(harness.desktop.getPresentedDrop(), null)
  assert.deepEqual(harness.desktop.getCurrentDrop()?.id, 'disabled')
  assert.equal(harness.presented.length, 0)
})
