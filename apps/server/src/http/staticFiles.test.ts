import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { resolveStaticPath, sendStaticFile } from './staticFiles.js'

test('static path resolver accepts release names and rejects traversal', () => {
  const root = path.resolve('releases')

  assert.equal(
    resolveStaticPath(root, 'MemeDrop%20Setup%204.0.1.exe'),
    path.resolve(root, 'MemeDrop Setup 4.0.1.exe'),
  )
  assert.equal(resolveStaticPath(root, '../secret'), null)
  assert.equal(resolveStaticPath(root, '%2e%2e%2fsecret'), null)
  assert.equal(resolveStaticPath(root, '%5c..%5csecret'), null)
  assert.equal(resolveStaticPath(root, '%ZZ'), null)
})

test('static file sender serves GET, HEAD and missing files consistently', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memedrop-updates-'))
  const contents = 'version: 4.0.1\n'
  const releaseName = 'MemeDrop Setup 4.0.1.yml'
  await writeFile(path.join(root, releaseName), contents)

  const server = http.createServer((request, response) => {
    void sendStaticFile(
      response,
      root,
      request.url?.slice(1) ?? '',
      request.method === 'HEAD',
    )
  })

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    assert.ok(address && typeof address !== 'string')

    const releaseUrl = `http://127.0.0.1:${address.port}/${encodeURIComponent(releaseName)}`
    const getResponse = await fetch(releaseUrl)
    assert.equal(getResponse.status, 200)
    assert.equal(getResponse.headers.get('content-length'), String(Buffer.byteLength(contents)))
    assert.equal(getResponse.headers.get('content-type'), 'application/x-yaml; charset=utf-8')
    assert.equal(await getResponse.text(), contents)

    const headResponse = await fetch(releaseUrl, {
      method: 'HEAD',
    })
    assert.equal(headResponse.status, 200)
    assert.equal(headResponse.headers.get('content-length'), String(Buffer.byteLength(contents)))
    assert.equal(headResponse.headers.get('content-type'), 'application/x-yaml; charset=utf-8')
    assert.equal(await headResponse.text(), '')

    const missingResponse = await fetch(`http://127.0.0.1:${address.port}/missing.yml`, {
      method: 'HEAD',
    })
    assert.equal(missingResponse.status, 404)
    assert.equal(await missingResponse.text(), '')
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
    await rm(root, { recursive: true, force: true })
  }
})
