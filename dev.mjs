import { spawn } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const processes = [
  spawn(npmCommand, ['run', 'api'], { stdio: 'inherit', shell: true }),
  spawn(npmCommand, ['run', 'frontend'], { stdio: 'inherit', shell: true }),
]

let stopping = false
const stop = (code = 0) => {
  if (stopping) return
  stopping = true
  for (const child of processes) {
    if (!child.killed) child.kill()
  }
  process.exit(code)
}

for (const child of processes) {
  child.on('error', error => {
    console.error(`Não foi possível iniciar um processo: ${error.message}`)
    stop(1)
  })
  child.on('exit', code => {
    if (!stopping && code && code !== 0) stop(code)
  })
}

process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
