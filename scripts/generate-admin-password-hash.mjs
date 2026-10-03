#!/usr/bin/env node

import { randomBytes, scryptSync } from 'node:crypto'
import { stdin, stdout } from 'node:process'

const password = process.argv[2] || await readPasswordFromStdin()

if (!password) {
  console.error('Usage: npm run auth:hash -- <new-admin-password>')
  process.exit(1)
}

const salt = randomBytes(16).toString('hex')
const hash = scryptSync(password, salt, 32).toString('hex')
stdout.write(`scrypt:${salt}:${hash}\n`)

function readPasswordFromStdin() {
  if (stdin.isTTY) return Promise.resolve('')

  return new Promise((resolve, reject) => {
    let value = ''
    stdin.setEncoding('utf8')
    stdin.on('data', (chunk) => {
      value += chunk
    })
    stdin.on('end', () => resolve(value.trimEnd()))
    stdin.on('error', reject)
  })
}
