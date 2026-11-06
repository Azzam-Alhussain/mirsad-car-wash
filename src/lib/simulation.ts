import type { Settings, VehicleSize, WashEvent } from '../types'

export const OPEN_MINUTE = 8 * 60
export const INITIAL_CLOCK = 14 * 60 + 32
export const BAY_COUNT = 3
const runtimeDate = new Date()
export const TODAY_KEY = `${runtimeDate.getFullYear()}-${String(runtimeDate.getMonth() + 1).padStart(2, '0')}-${String(runtimeDate.getDate()).padStart(2, '0')}`

export const defaultSettings: Settings = {
  prices: { small: 35, medium: 50, large: 70 },
  variableCosts: { small: 8, medium: 11, large: 15 },
  targets: { small: 18, medium: 25, large: 32 },
  fixedDaily: 450,
  laborDaily: 360,
}

const sizePattern: VehicleSize[] = ['small', 'medium', 'small', 'large', 'medium', 'small']

export function createInitialEvents(): WashEvent[] {
  const completed: WashEvent[] = Array.from({ length: 34 }, (_, index) => {
    const size = sizePattern[index % sizePattern.length]
    const base = size === 'small' ? 18 : size === 'medium' ? 25 : 32
    const plannedDuration = base + ((index * 7) % 9) - 3
    const entry = OPEN_MINUTE + index * 11
    const exit = entry + plannedDuration
    return {
      id: `wash-${index + 1}`, code: `W-${1001 + index}`, size,
      arrival: entry - (index % 4), entry, exit, bay: (index % BAY_COUNT) + 1,
      status: 'completed' as const, confidence: [7, 18, 29].includes(index) ? 0.72 : 0.91 + ((index % 8) / 100),
      plannedDuration, dayKey: TODAY_KEY, cameraId: `CAM-${(index % BAY_COUNT) + 1}`,
      entryCapturedAt: entry, exitCapturedAt: exit, source: 'simulation' as const,
    }
  })

  const active: WashEvent[] = [
    { id: 'wash-35', code: 'W-1035', size: 'medium', arrival: 14 * 60 + 8, entry: 14 * 60 + 12, bay: 1, status: 'washing', confidence: 0.97, plannedDuration: 28, dayKey: TODAY_KEY, cameraId: 'CAM-1', entryCapturedAt: 14 * 60 + 12, source: 'simulation' },
    { id: 'wash-36', code: 'W-1036', size: 'large', arrival: 14 * 60 + 20, entry: 14 * 60 + 23, bay: 2, status: 'washing', confidence: 0.94, plannedDuration: 36, dayKey: TODAY_KEY, cameraId: 'CAM-2', entryCapturedAt: 14 * 60 + 23, source: 'simulation' },
    { id: 'wash-37', code: 'W-1037', size: 'small', arrival: 14 * 60 + 27, entry: 14 * 60 + 27, bay: 3, status: 'washing', confidence: 0.96, plannedDuration: 19, dayKey: TODAY_KEY, cameraId: 'CAM-3', entryCapturedAt: 14 * 60 + 27, source: 'simulation' },
    { id: 'wash-38', code: 'W-1038', size: 'medium', arrival: 14 * 60 + 30, entry: 14 * 60 + 30, status: 'queued', confidence: 0.89, plannedDuration: 25, dayKey: TODAY_KEY, source: 'simulation' },
    { id: 'wash-39', code: 'W-1039', size: 'small', arrival: 14 * 60 + 32, entry: 14 * 60 + 32, status: 'queued', confidence: 0.93, plannedDuration: 18, dayKey: TODAY_KEY, source: 'simulation' },
  ]
  return [...completed, ...active]
}

export function advanceSimulation(events: WashEvent[], clock: number, delta: number) {
  const nextClock = clock + delta
  let next = events.map((event) => {
    if (event.status === 'washing' && event.entry + event.plannedDuration <= nextClock) {
      const exit = event.entry + event.plannedDuration
      return { ...event, status: 'completed' as const, exit, exitCapturedAt: exit }
    }
    return event
  })

  const lastArrival = Math.max(...next.map((event) => event.arrival), OPEN_MINUTE)
  const waiting = next.filter((event) => event.status === 'queued').length
  if (delta > 0 && nextClock - lastArrival >= 13 && waiting < 3) {
    const serial = Math.max(...next.map((event) => Number(event.code.split('-')[1])), 1000) + 1
    next = [...next, createVehicle(next, nextClock, sizePattern[serial % sizePattern.length])]
  }

  for (let bay = 1; bay <= BAY_COUNT; bay += 1) {
    const occupied = next.some((event) => event.status === 'washing' && event.bay === bay)
    if (occupied) continue
    const nextInQueue = next.filter((event) => event.status === 'queued').sort((a, b) => a.arrival - b.arrival)[0]
    if (!nextInQueue) continue
    const entry = Math.max(clock, nextInQueue.arrival)
    next = next.map((event) => event.id === nextInQueue.id
      ? { ...event, status: 'washing' as const, bay, entry, entryCapturedAt: entry, cameraId: `CAM-${bay}` }
      : event)
  }
  return { events: next, clock: nextClock }
}

export function calculateMetrics(events: WashEvent[], settings: Settings, clock: number) {
  const completed = events.filter((event) => event.status === 'completed' && event.exit !== undefined)
  const revenue = completed.reduce((sum, event) => sum + (event.price ?? settings.prices[event.size]), 0)
  const variableCost = completed.reduce((sum, event) => sum + (event.cost ?? settings.variableCosts[event.size]), 0)
  const netProfit = revenue - variableCost - settings.fixedDaily - settings.laborDaily
  const averageDuration = completed.length
    ? completed.reduce((sum, event) => sum + ((event.exit ?? event.entry) - event.entry), 0) / completed.length : 0
  const elapsedDay = Math.max(clock - OPEN_MINUTE, 1)
  const occupiedMinutes = events.reduce((sum, event) => {
    if (event.status === 'queued') return sum
    const end = event.exit ?? clock
    return sum + Math.max(0, Math.min(end, clock) - Math.max(event.entry, OPEN_MINUTE))
  }, 0)
  const utilization = Math.min(100, (occupiedMinutes / (elapsedDay * BAY_COUNT)) * 100)
  return { completed, revenue, variableCost, netProfit, averageDuration, utilization }
}

export function minutesToTime(minutes: number) {
  const normalized = Math.floor(minutes) % (24 * 60)
  const hours = Math.floor(normalized / 60).toString().padStart(2, '0')
  const mins = (normalized % 60).toString().padStart(2, '0')
  return `${hours}:${mins}`
}

export function createVehicle(events: WashEvent[], clock: number, size: VehicleSize): WashEvent {
  const serial = Math.max(...events.map((event) => Number(event.code.split('-')[1])), 1000) + 1
  return {
    id: `wash-${serial}-${Date.now()}`, code: `W-${serial}`, size, arrival: clock, entry: clock,
    status: 'queued', confidence: 0.9 + ((serial % 9) / 100), plannedDuration: defaultSettings.targets[size],
    dayKey: TODAY_KEY, source: 'simulation',
  }
}
