import type { ReportPeriod, Settings, WashEvent } from '../types'
import { TODAY_KEY } from './simulation'

export interface ServerWashEvent {
  id: number; trackingId: string; code: string; size: 'small' | 'medium' | 'large';
  status: 'queued' | 'washing' | 'completed'; cameraId: string; bay: number | null;
  arrivalAt: Date; entryAt: Date; exitAt: Date | null; durationMinutes: number | null;
  confidence: string; price: string; cost: string; entryImageUrl: string | null; exitImageUrl: string | null;
  source: 'simulation' | 'vision' | 'seed';
}

export function localDayKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function mapServerEvent(event: ServerWashEvent): WashEvent {
  const entry = event.entryAt.getHours() * 60 + event.entryAt.getMinutes()
  const arrival = event.arrivalAt.getHours() * 60 + event.arrivalAt.getMinutes()
  const exit = event.exitAt ? event.exitAt.getHours() * 60 + event.exitAt.getMinutes() : undefined
  return {
    id: `server-${event.id}`, code: event.code, size: event.size, arrival, entry, exit,
    bay: event.bay ?? undefined, status: event.status, confidence: Number(event.confidence),
    plannedDuration: event.durationMinutes ?? Math.max(1, (exit ?? entry) - entry), dayKey: localDayKey(event.entryAt),
    cameraId: event.cameraId, entryCapturedAt: entry, exitCapturedAt: exit,
    entryImageUrl: event.entryImageUrl, exitImageUrl: event.exitImageUrl,
    price: Number(event.price), cost: Number(event.cost), source: event.source,
  }
}

function sumEvents(events: WashEvent[], settings: Settings) {
  const completed = events.filter((event) => event.status === 'completed')
  const revenue = completed.reduce((sum, event) => sum + (event.price ?? settings.prices[event.size]), 0)
  const variableCost = completed.reduce((sum, event) => sum + (event.cost ?? settings.variableCosts[event.size]), 0)
  return { count: completed.length, revenue, variableCost }
}

export function periodAnalytics(allEvents: WashEvent[], settings: Settings, period: ReportPeriod) {
  const todayEvents = allEvents.filter((event) => event.dayKey === TODAY_KEY)
  const monthKey = TODAY_KEY.slice(0, 7)
  if (period === 'daily') {
    const totals = sumEvents(todayEvents, settings)
    return { ...totals, fixedCost: settings.fixedDaily + settings.laborDaily, netProfit: totals.revenue - totals.variableCost - settings.fixedDaily - settings.laborDaily, projected: false }
  }
  if (period === 'monthly') {
    const monthEvents = allEvents.filter((event) => event.dayKey?.startsWith(monthKey))
    const totals = sumEvents(monthEvents, settings)
    const days = Number(TODAY_KEY.slice(8, 10))
    const fixedCost = (settings.fixedDaily + settings.laborDaily) * days
    return { ...totals, fixedCost, netProfit: totals.revenue - totals.variableCost - fixedCost, projected: false }
  }
  const cutoff = new Date(`${TODAY_KEY}T00:00:00`)
  cutoff.setDate(cutoff.getDate() - 29)
  const last30 = allEvents.filter((event) => event.dayKey && event.dayKey >= localDayKey(cutoff) && event.dayKey <= TODAY_KEY)
  const totals = sumEvents(last30, settings)
  const activeDays = Math.max(1, new Set(last30.map((event) => event.dayKey)).size)
  const dailyRevenue = totals.revenue / activeDays
  const dailyVariable = totals.variableCost / activeDays
  const revenue = dailyRevenue * 365
  const variableCost = dailyVariable * 365
  const fixedCost = (settings.fixedDaily + settings.laborDaily) * 365
  return { count: Math.round((totals.count / activeDays) * 365), revenue, variableCost, fixedCost, netProfit: revenue - variableCost - fixedCost, projected: true }
}

export function monthlySeries(allEvents: WashEvent[], settings: Settings, language: 'ar' | 'en' = 'ar') {
  const base = new Date(`${TODAY_KEY}T12:00:00`)
  const locale = language === 'ar' ? 'ar-SA' : 'en-US'
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(base)
    date.setMonth(base.getMonth() - (5 - index))
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const monthEvents = allEvents.filter((event) => event.dayKey?.startsWith(key))
    const totals = sumEvents(monthEvents, settings)
    const days = new Set(monthEvents.map((event) => event.dayKey)).size
    const profit = totals.revenue - totals.variableCost - days * (settings.fixedDaily + settings.laborDaily)
    return { key, label: new Intl.DateTimeFormat(locale, { month: 'short' }).format(date), cars: totals.count, revenue: Math.round(totals.revenue), profit: Math.round(profit) }
  })
}

export function yearlyProjectionSeries(allEvents: WashEvent[], settings: Settings, language: 'ar' | 'en' = 'ar') {
  const monthly = monthlySeries(allEvents, settings, language)
  const valid = monthly.filter((month) => month.cars > 0)
  const average = valid.length ? valid.reduce((sum, month) => sum + month.profit, 0) / valid.length : 0
  return Array.from({ length: 12 }, (_, index) => ({
    label: new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', { month: 'short' }).format(new Date(Number(TODAY_KEY.slice(0, 4)), index, 1)),
    profit: Math.round(average), revenue: 0, cars: 0, key: String(index),
  }))
}
