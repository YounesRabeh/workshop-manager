import { stdin } from 'node:process'

const chunks = []
const shouldReadStdin = process.argv.includes('--read-stdin')

function emitResult() {
  const input = Buffer.concat(chunks)
  console.log(JSON.stringify({
    platform: process.platform,
    argv: process.argv.slice(2).filter((arg) => arg !== '--read-stdin'),
    stdinHex: input.toString('hex'),
    stdinUtf8: input.toString('utf8')
  }))
}

if (shouldReadStdin) {
  stdin.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
  stdin.on('end', emitResult)
} else {
  emitResult()
}
