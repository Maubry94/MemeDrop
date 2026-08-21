import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = path.resolve(projectRoot, '..', '..')
const outputDirectory = path.join(projectRoot, 'dist')
const compilerPath = path.join(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc')
const desktopPackagePath = path.join(repositoryRoot, 'apps', 'desktop', 'package.json')

const desktopPackage = JSON.parse(await readFile(desktopPackagePath, 'utf8'))
const desktopVersion = desktopPackage.version
if (typeof desktopVersion !== 'string' || !desktopVersion.trim()) {
  throw new Error(`Version desktop absente ou invalide dans ${desktopPackagePath}.`)
}

await rm(outputDirectory, { recursive: true, force: true })

const exitCode = await new Promise((resolve, reject) => {
  const compiler = spawn(
    process.execPath,
    [compilerPath, '-p', path.join(projectRoot, 'tsconfig.json')],
    {
      cwd: projectRoot,
      stdio: 'inherit',
    },
  )

  compiler.once('error', reject)
  compiler.once('exit', (code, signal) => {
    if (signal) {
      reject(new Error(`TypeScript compiler stopped with signal ${signal}.`))
      return
    }

    resolve(code ?? 1)
  })
})

if (exitCode !== 0) {
  process.exitCode = exitCode
} else {
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(
    path.join(outputDirectory, 'app-version.json'),
    `${JSON.stringify({ latestAppVersion: desktopVersion.trim() })}\n`,
    'utf8',
  )
}
