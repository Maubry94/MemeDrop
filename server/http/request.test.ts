import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHostHeader, parsePublicBaseUrl, parseRequestUrl } from './request.js'

test('request URL parser accepts origin-form URLs only', () => {
  assert.equal(parseRequestUrl('/health?format=json')?.pathname, '/health')
  assert.equal(parseRequestUrl('https://example.com/health'), null)
  assert.equal(parseRequestUrl('//example.com/health'), null)
  assert.equal(parseRequestUrl('/%ZZ'), null)
  assert.equal(parseRequestUrl('/updates/%2e%2e/health'), null)
  assert.equal(parseRequestUrl('/updates/%5c..%5csecret'), null)
})

test('host parser rejects authority injection', () => {
  assert.deepEqual(parseHostHeader('localhost:3010'), {
    host: 'localhost:3010',
    hostname: 'localhost',
  })
  assert.equal(parseHostHeader('example.com@localhost'), null)
  assert.equal(parseHostHeader('example.com/path'), null)
  assert.equal(parseHostHeader('example.com, attacker.test'), null)
})

test('public base URL requires HTTPS except on loopback', () => {
  assert.equal(parsePublicBaseUrl('https://memedrop.example.com'), 'https://memedrop.example.com')
  assert.equal(parsePublicBaseUrl('http://localhost:3010'), 'http://localhost:3010')
  assert.equal(parsePublicBaseUrl('http://memedrop.example.com'), null)
  assert.equal(parsePublicBaseUrl('https://memedrop.example.com/path'), null)
})
