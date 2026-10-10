import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('deployment scripts', () => {
  it('runs migrations only in deployment builds while local and CI builds stay database-free', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
    const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
    const securityAudit = await readFile(
      new URL('../scripts/security-audit.mjs', import.meta.url),
      'utf8'
    )

    expect(packageJson.scripts['build:app']).toBe('next build --webpack')
    expect(packageJson.scripts.build).toBe('npm run db:migrate && npm run build:app')
    expect(packageJson.scripts['deploy:build']).toBe('npm run build')
    expect(packageJson.scripts['db:migrate']).toBe('node scripts/migrate.mjs')
    expect(packageJson.scripts['db:migrate:local']).toContain('--env-file-if-exists=.env.local')
    expect(packageJson.scripts['verify:local']).toContain('npm run build:app')
    expect(packageJson.scripts['verify:local']).not.toContain('npm run build &&')
    expect(packageJson.scripts['security:verify']).toContain('npm run build:app')
    expect(securityAudit).toContain('run("npm", ["run", "build:app"])')
    expect(securityAudit).not.toContain('run("npm", ["run", "build"])')
    expect(workflow).toContain('run: npm run build:app')
    expect(vercel.buildCommand).toBe('npm run build:app')
  })
})
