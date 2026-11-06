import { useState } from 'react'
import { BarChart3, CalendarDays, CircleDollarSign, Settings2, TrendingUp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Settings, WashEvent } from '../types'
import { monthlySeries, periodAnalytics, yearlyProjectionSeries } from '../lib/history'
import { minutesToTime, TODAY_KEY } from '../lib/simulation'
import { usePreferences } from '../providers/preferences'

export function ReportsView({ events, settings, onEditSettings }: { events: WashEvent[]; settings: Settings; onEditSettings: () => void }) {
  const [period, setPeriod] = useState<'daily' | 'monthly' | 'yearly'>('daily')
  const { t, number, money, language, theme } = usePreferences()
  const summary = periodAnalytics(events, settings, period)
  const periodLabels = { daily: t('Today'), monthly: t('This month'), yearly: t('Estimated year') }
  const series = period === 'yearly' ? yearlyProjectionSeries(events, settings, language) : monthlySeries(events, settings, language)
  const today = events.filter((event) => event.dayKey === TODAY_KEY && event.status === 'completed')
  const hourly = Array.from({ length: 7 }, (_, index) => {
    const hour = 8 + index
    const matches = today.filter((event) => event.exit !== undefined && Math.floor(event.exit / 60) === hour)
    return { label: minutesToTime(hour * 60), revenue: matches.reduce((sum, event) => sum + (event.price ?? settings.prices[event.size]), 0), profit: 0, cars: matches.length, key: String(hour) }
  })
  const chartData = period === 'daily' ? hourly : series
  const chartColors = theme === 'dark'
    ? { grid: '#1a2540', tick: '#8e9aaf', tooltip: '#111a2b', text: '#f1f5f9' }
    : { grid: '#dbe3ec', tick: '#526174', tooltip: '#ffffff', text: '#172337' }

  return <>
    <section className="report-hero simple">
      <div><span className="live-label"><BarChart3 size={14} />{t('Monitoring linked to profitability')}</span><h2>{t('Every wash becomes a clear number.')}</h2><p>{t('Actual values for completed operations; annual values are projected from the latest 30-day average.')}</p></div>
      <button className="secondary-button" onClick={onEditSettings}><Settings2 size={16} />{t('Edit prices and costs')}</button>
    </section>
    <div className="period-tabs" role="tablist" aria-label={t('Financial period')}>
      {(['daily', 'monthly', 'yearly'] as const).map((item) => <button key={item} role="tab" aria-selected={period === item} className={period === item ? 'active' : ''} onClick={() => setPeriod(item)}>{t({ daily: 'Daily', monthly: 'Monthly', yearly: 'Yearly' }[item])}</button>)}
    </div>
    <section className="kpi-grid report-kpis">
      <article className="kpi-card tone-mint"><div className="kpi-top"><span>{t('Completed vehicles · {period}', { period: periodLabels[period] })}</span><CalendarDays size={18} /></div><strong>{number(summary.count)}</strong><p>{summary.projected ? t('Projected count from the current average') : t('Recorded operations')}</p></article>
      <article className="kpi-card tone-cyan"><div className="kpi-top"><span>{t('Revenue · {period}', { period: periodLabels[period] })}</span><CircleDollarSign size={18} /></div><strong>{money(summary.revenue)}</strong><p>{t('Prices stored with every operation')}</p></article>
      <article className="kpi-card tone-plain"><div className="kpi-top"><span>{t('Total costs')}</span><CircleDollarSign size={18} /></div><strong>{money(summary.variableCost + summary.fixedCost)}</strong><p>{t('{variable} variable + {fixed} fixed', { variable: money(summary.variableCost), fixed: money(summary.fixedCost) })}</p></article>
      <article className="kpi-card tone-amber"><div className="kpi-top"><span>{t('Net profit · {period}', { period: periodLabels[period] })}</span><TrendingUp size={18} /></div><strong>{money(summary.netProfit)}</strong><p>{summary.projected ? t('Projection, not realized profit') : t('Margin {value}%', { value: number(summary.revenue ? Math.round((summary.netProfit / summary.revenue) * 100) : 0) })}</p></article>
    </section>
    <div className="reports-grid">
      <section className="panel revenue-chart-panel">
        <div className="section-head"><div><h2>{period === 'daily' ? t('Revenue by hour') : period === 'monthly' ? t('Last six months') : t('Monthly projection for the year')}</h2><p>{period === 'yearly' ? t('Monthly average based on available data') : t('Revenue and profit from completed operations')}</p></div></div>
        <div className="chart-wrap tall"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 8, right: 0, left: 4, bottom: 0 }}><CartesianGrid stroke={chartColors.grid} vertical={false} /><XAxis dataKey="label" tick={{ fill: chartColors.tick, fontSize: 11 }} axisLine={false} tickLine={false} reversed={language === 'ar'} /><YAxis tick={{ fill: chartColors.tick, fontSize: 11 }} axisLine={false} tickLine={false} orientation={language === 'ar' ? 'right' : 'left'} /><Tooltip contentStyle={{ background: chartColors.tooltip, border: `1px solid ${chartColors.grid}`, borderRadius: 8, color: chartColors.text }} formatter={(value, name) => [money(Number(value)), name === 'profit' ? t('Profit') : t('Revenue')]} /><Bar dataKey="revenue" fill="#22d3ee" radius={[4, 4, 0, 0]} maxBarSize={32} /><Bar dataKey="profit" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={32} /></BarChart></ResponsiveContainer></div>
      </section>
      <section className="panel economics-panel">
        <div className="section-head"><div><h2>{t('Profit equation')}</h2><p>{t('{period} · traceable', { period: periodLabels[period] })}</p></div></div>
        <div className="profit-flow"><div><span>{t('Revenue')}</span><strong>{money(summary.revenue)}</strong></div><i>−</i><div><span>{t('Variable cost')}</span><strong>{money(summary.variableCost)}</strong></div><i>−</i><div><span>{t('Fixed costs and labor')}</span><strong>{money(summary.fixedCost)}</strong></div><i>=</i><div className="profit-result"><span>{t('Net profit')}</span><strong>{money(summary.netProfit)}</strong></div></div>
        <div className="report-note">{t('Vehicles being washed or queued are excluded from revenue until exit is recorded.')}</div>
      </section>
    </div>
  </>
}
