import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { resolveStaticPath } from './staticFiles.js'

test('static path resolver accepts release names and rejects traversal', () => {
  const root = path.resolve('releases')

  assert.equal(
    resolveStaticPath(root, 'MemeDrop%20Setup%203.0.6.exe'),
    path.resolve(root, 'MemeDrop Setup 3.0.6.exe'),
  )
  assert.equal(resolveStaticPath(root, '../secret'), null)
  assert.equal(resolveStaticPath(root, '%2e%2e%2fsecret'), null)
  assert.equal(resolveStaticPath(root, '%5c..%5csecret'), null)
  assert.equal(resolveStaticPath(root, '%ZZ'), null)
})
