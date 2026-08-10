import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const requestedMode = process.argv[2]
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npmCli = process.env.npm_execpath
const electronBuilderCli = path.join(
  projectRoot,
  'node_modules',
  'electron-builder',
  'out',
  'cli',
  'cli.js',
)

const modes = {
  local: {
    policyMode: 'disabled',
    updateMode: 'disabled',
    output: 'local',
    builderArgs: [],
  },
  unpacked: {
    policyMode: 'disabled',
    updateMode: 'disabled',
    output: 'local',
    builderArgs: ['--win', '--dir'],
  },
  update: {
    policyMode: 'update',
    updateMode: 'ed25519',
    output: 'update',
    builderArgs: ['--win', '--x64'],
  },
  signed: {
    policyMode: 'signed',
    updateMode: 'authenticode',
    output: 'signed',
    builderArgs: ['--win', '--x64'],
  },
}

const mode = modes[requestedMode]
if (!mode) {
  throw new Error("Mode de build attendu : 'local', 'unpacked', 'update' ou 'signed'.")
}

if (!npmCli) {
  throw new Error('Ce script doit être lancé via npm afin de localiser npm-cli.js.')
}

const buildEnv = {
  ...process.env,
  MEMEDROP_UPDATE_MODE: mode.updateMode,
}

const runNode = (scriptPath, args = []) => {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: projectRoot,
    env: buildEnv,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

runNode(path.join(projectRoot, 'scripts', 'checkUpdateBuildPolicy.mjs'), [mode.policyMode])
runNode(npmCli, ['run', 'build:app'])
runNode(path.join(projectRoot, 'scripts', 'cleanReleaseOutput.mjs'), [mode.output])
runNode(electronBuilderCli, [
  '--config',
  'electron-builder.config.cjs',
  '--publish',
  'never',
  ...mode.builderArgs,
])

if (requestedMode === 'update' || requestedMode === 'signed') {
  runNode(path.join(projectRoot, 'scripts', 'createUpdateReleaseManifest.mjs'))
}

if (requestedMode === 'signed') {
  runNode(path.join(projectRoot, 'scripts', 'verifyWindowsRelease.mjs'))
}
