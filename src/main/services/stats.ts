import os from 'node:os'
import { statfs } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import si from 'systeminformation'
import type { StatsSnapshot } from '../../shared/types'

const SLOW_MS = 10_000
const NET_MS = 3000 // networkStats spawns a process on Windows: sample it slower than the cheap metrics
const GB = 1024 ** 3

/** Wraps a sensor read: any failure becomes null, never an exception. */
async function safe<T>(fn: () => Promise<T | null> | T | null): Promise<T | null> {
  try {
    return (await fn()) ?? null
  } catch {
    return null
  }
}

function cpuTimes(): { idle: number; total: number } {
  let idle = 0
  let total = 0
  for (const c of os.cpus()) {
    idle += c.times.idle
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq
  }
  return { idle, total }
}

function nvidiaGpu(): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'],
      { timeout: 2000, windowsHide: true },
      (err, out) => {
        const v = err ? NaN : Number.parseFloat(out.split('\n')[0] ?? '')
        resolve(Number.isFinite(v) ? v : null)
      }
    )
  })
}

/**
 * A value that refreshes itself in the background at most every `ms`. Reading it never waits: slow sensors
 * (they spawn processes on Windows) must not delay the cheap metrics, and the first tick shows data at once.
 */
function background<T>(ms: number, read: () => Promise<T | null>): () => T | null {
  let value: T | null = null
  let at = 0
  let running = false
  return () => {
    if (!running && Date.now() - at > ms) {
      running = true
      at = Date.now()
      void safe(read).then((v) => { value = v }).finally(() => { running = false })
    }
    return value
  }
}

/** CPU and RAM come from Node built-ins every tick; everything else refreshes in the background. */
export function createStatsSampler() {
  let prev = cpuTimes()
  const sysDrive = process.env.SystemDrive ? `${process.env.SystemDrive}\\` : 'C:\\'

  const disk = background(30_000, async () => {
    const s = await statfs(sysDrive)
    const total = s.blocks * s.bsize
    const used = total - s.bavail * s.bsize
    return { disk: Math.round((used / total) * 100), diskText: `${(used / GB).toFixed(0)} / ${(total / GB).toFixed(0)} GB` }
  })
  const gpu = background(SLOW_MS, nvidiaGpu)
  const cpuTemp = background(SLOW_MS, async () => {
    const t = (await si.cpuTemperature()).main
    return typeof t === 'number' && t > 1 && t < 120 ? Math.round(t) : null
  })
  const net = background(NET_MS, async () => {
    let down = 0
    let up = 0
    let seen = false
    for (const r of await si.networkStats('*')) {
      if (typeof r.rx_sec === 'number' && typeof r.tx_sec === 'number' && r.rx_sec >= 0) {
        down += r.rx_sec
        up += r.tx_sec
        seen = true
      }
    }
    return seen ? { down, up } : null
  })

  return async function sample(): Promise<StatsSnapshot> {
    const now = cpuTimes()
    const dTotal = now.total - prev.total
    const cpu = dTotal > 0 ? Math.round((1 - (now.idle - prev.idle) / dTotal) * 100) : null
    prev = now
    const totalMem = os.totalmem()
    const usedMem = totalMem - os.freemem()
    const d = disk()
    const n = net()
    return {
      cpu,
      ram: Math.round((usedMem / totalMem) * 100),
      ramText: `${(usedMem / GB).toFixed(1)} / ${(totalMem / GB).toFixed(0)} GB`,
      gpu: gpu(),
      disk: d?.disk ?? null,
      diskText: d?.diskText ?? null,
      netDown: n?.down ?? null,
      netUp: n?.up ?? null,
      cpuTemp: cpuTemp()
    }
  }
}
