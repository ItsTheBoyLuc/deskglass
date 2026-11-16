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
 * Cheap metrics (CPU/RAM/disk) are computed with Node built-ins every tick; the expensive ones that
 * spawn processes (network, temperature, GPU) are sampled at most every SLOW_MS or via lightweight calls.
 */
export function createStatsSampler() {
  let prev = cpuTimes()
  let slow: Pick<StatsSnapshot, 'gpu' | 'cpuTemp'> = { gpu: null, cpuTemp: null }
  let slowAt = 0
  let disk: Pick<StatsSnapshot, 'disk' | 'diskText'> = { disk: null, diskText: null }
  let diskAt = 0
  let net: { down: number; up: number } | null = null
  let netAt = 0
  const sysDrive = process.env.SystemDrive ? `${process.env.SystemDrive}\\` : 'C:\\'

  return async function sample(): Promise<StatsSnapshot> {
    const now = cpuTimes()
    const dTotal = now.total - prev.total
    const cpu = dTotal > 0 ? Math.round((1 - (now.idle - prev.idle) / dTotal) * 100) : null
    prev = now

    const totalMem = os.totalmem()
    const usedMem = totalMem - os.freemem()

    if (Date.now() - diskAt > 30_000) {
      diskAt = Date.now()
      disk = await safe(async () => {
        const s = await statfs(sysDrive)
        const total = s.blocks * s.bsize
        const used = total - s.bavail * s.bsize
        return { disk: Math.round((used / total) * 100), diskText: `${(used / GB).toFixed(0)} / ${(total / GB).toFixed(0)} GB` }
      }) ?? { disk: null, diskText: null }
    }

    if (Date.now() - slowAt > SLOW_MS) {
      slowAt = Date.now()
      const [gpu, temp] = await Promise.all([
        safe(nvidiaGpu),
        safe(async () => {
          const t = (await si.cpuTemperature()).main
          return typeof t === 'number' && t > 1 && t < 120 ? Math.round(t) : null
        })
      ])
      slow = { gpu, cpuTemp: temp }
    }

    if (Date.now() - netAt > NET_MS) {
      netAt = Date.now()
      net = await safe(async () => {
      const rows = await si.networkStats('*')
      let down = 0
      let up = 0
      let seen = false
      for (const r of rows) {
        if (typeof r.rx_sec === 'number' && typeof r.tx_sec === 'number' && r.rx_sec >= 0) {
          down += r.rx_sec
          up += r.tx_sec
          seen = true
        }
      }
      return seen ? { down, up } : null
      })
    }

    return {
      cpu,
      ram: Math.round((usedMem / totalMem) * 100),
      ramText: `${(usedMem / GB).toFixed(1)} / ${(totalMem / GB).toFixed(0)} GB`,
      gpu: slow.gpu,
      ...disk,
      netDown: net?.down ?? null,
      netUp: net?.up ?? null,
      cpuTemp: slow.cpuTemp
    }
  }
}
