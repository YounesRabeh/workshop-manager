import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RunLogStore } from '../../src/backend/stores/run-log-store'

describe('RunLogStore batching', () => {
  it('preserves line order with batched writes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'run-log-store-order-'))
    const store = new RunLogStore(join(root, 'logs'))
    const runId = 'run-order'
    await store.create(runId)

    const lines = Array.from({ length: 40 }, (_, index) => `line-${index + 1}`)
    for (const line of lines) {
      await store.appendLine(runId, line)
    }

    const finalized = await store.finalize(runId, { success: true, status: 'success' })
    const persisted = await readFile(finalized.logPath, 'utf8')
    const persistedLines = persisted.trim().split('\n')
    expect(persistedLines).toEqual(lines)
  })

  it('flushes pending buffered lines during finalize', async () => {
    const root = await mkdtemp(join(tmpdir(), 'run-log-store-finalize-'))
    const store = new RunLogStore(join(root, 'logs'))
    const runId = 'run-finalize'
    await store.create(runId)

    await store.appendLine(runId, 'first')
    await store.appendLine(runId, 'second')

    const finalized = await store.finalize(runId, { success: true, status: 'success' })
    const persisted = await readFile(finalized.logPath, 'utf8')
    expect(persisted.trim().split('\n')).toEqual(['first', 'second'])
  })

  it('does not drop lines under high-volume append bursts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'run-log-store-burst-'))
    const store = new RunLogStore(join(root, 'logs'))
    const runId = 'run-burst'
    await store.create(runId)

    const totalLines = 220
    for (let index = 0; index < totalLines; index += 1) {
      await store.appendLine(runId, `burst-${index}`)
    }

    const finalized = await store.finalize(runId, { success: true, status: 'success' })
    const persisted = await readFile(finalized.logPath, 'utf8')
    const persistedLines = persisted.trim().split('\n')
    expect(persistedLines).toHaveLength(totalLines)
    expect(persistedLines[0]).toBe('burst-0')
    expect(persistedLines[persistedLines.length - 1]).toBe(`burst-${totalLines - 1}`)
  })
})
