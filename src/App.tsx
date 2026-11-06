import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, Camera, CarFront, Check, ChevronLeft, CircleDollarSign,
  Clock3, Cpu, Download, Gauge, Languages, LayoutDashboard, ListFilter, Menu, Moon,
  Pause, Play, Plus, RotateCcw, Settings2, Sun, TimerReset, TrendingUp, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Toaster, toast } from 'sonner'
import { trpc } from '@/providers/trpc'
import { usePreferences } from '@/providers/preferences'
import { BrandMark, VehicleVisual } from './components/VehicleVisual'
import { CameraCapture } from './components/CameraCapture'
import { ReportsView } from './components/ReportsView'
import { IntegrationView } from './components/IntegrationView'
import {
  BAY_COUNT, INITIAL_CLOCK, TODAY_KEY, advanceSimulation, calculateMetrics,
  createInitialEvents, createVehicle, defaultSettings, minutesToTime,
} from './lib/simulation'
import { mapServerEvent } from './lib/history'
import type { Settings, VehicleSize, View, WashEvent, WashStatus } from './types'

const FRONTEND_DEMO = import.meta.env.VITE_FRONTEND_DEMO === 'true'

const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Live monitoring', icon: LayoutDashboard },
  { id: 'operations', label: 'Vehicle records', icon: ListFilter },
  { id: 'reports', label: 'Profit & reports', icon: TrendingUp },
  { id: 'integration', label: 'Camera & AI integration', icon: Cpu },
  { id: 'settings', label: 'Prices & costs', icon: Settings2 },
]
const viewTitles: Record<View, string> = {
  overview: 'Automatic monitoring', operations: 'Vehicle records', reports: 'Profit & reports',
  integration: 'Camera and AI integration', settings: 'Prices & costs',
}

function SectionHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return <div className="section-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>
}
function EmptyState({ text }: { text: string }) { return <div className="empty-state"><CarFront size={24} /><span>{text}</span></div> }

export default function App() {
  const { language, theme, setLanguage, setTheme, t, number, decimal, money, sizeText, statusText } = usePreferences()
  const direction = language === 'ar' ? 'rtl' : 'ltr'
  const percentSign = language === 'ar' ? '٪' : '%'
  const [activeView, setActiveView] = useState<View>('overview')
  const [events, setEvents] = useState<WashEvent[]>(createInitialEvents)
  const [clock, setClock] = useState(INITIAL_CLOCK)
  const [running, setRunning] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [addOpen, setAddOpen] = useState(false)
  const [newSize, setNewSize] = useState<VehicleSize>('medium')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [selectedBay, setSelectedBay] = useState(1)
  const [selectedCaptureId, setSelectedCaptureId] = useState('wash-35')
  const [capturePhase, setCapturePhase] = useState<'entry' | 'exit'>('entry')
  const [captureModalId, setCaptureModalId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sizeFilter, setSizeFilter] = useState<'all' | VehicleSize>('all')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<Settings | null>(null)
  const utils = trpc.useUtils()
  const eventsQuery = trpc.events.list.useQuery(undefined, { enabled: !FRONTEND_DEMO, refetchInterval: FRONTEND_DEMO ? false : 15000 })
  const settingsQuery = trpc.settings.get.useQuery(undefined, { enabled: !FRONTEND_DEMO })
  const saveSettingsMutation = trpc.settings.update.useMutation({ onSuccess: () => utils.settings.get.invalidate() })
  const correctSizeMutation = trpc.events.correctSize.useMutation()

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      setClock((currentClock) => {
        setEvents((currentEvents) => advanceSimulation(currentEvents, currentClock, speed).events)
        return currentClock + speed
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running, speed])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileMenu(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const settings = useMemo<Settings>(() => {
    if (settingsDraft) return settingsDraft
    const data = settingsQuery.data
    if (!data) return defaultSettings
    return {
      targets: defaultSettings.targets,
      prices: { small: Number(data.smallPrice), medium: Number(data.mediumPrice), large: Number(data.largePrice) },
      variableCosts: { small: Number(data.smallCost), medium: Number(data.mediumCost), large: Number(data.largeCost) },
      fixedDaily: Number(data.fixedDaily), laborDaily: Number(data.laborDaily),
    }
  }, [settingsDraft, settingsQuery.data])
  const serverEvents = useMemo(() => (eventsQuery.data ?? []).map((event) => mapServerEvent(event)), [eventsQuery.data])
  const visionEvents = serverEvents.filter((event) => event.source === 'vision')
  const dailyEvents = useMemo(() => [...events, ...visionEvents.filter((event) => event.dayKey === TODAY_KEY)], [events, visionEvents])
  const allEvents = useMemo(() => [...events, ...serverEvents], [events, serverEvents])
  const metrics = useMemo(() => calculateMetrics(dailyEvents, settings, clock), [dailyEvents, settings, clock])
  const active = dailyEvents.filter((event) => event.status === 'washing')
  const queued = dailyEvents.filter((event) => event.status === 'queued').sort((a, b) => a.arrival - b.arrival)
  const reviewCount = dailyEvents.filter((event) => event.confidence < 0.8).length
  const delayed = active.filter((event) => clock - event.entry > settings.targets[event.size])
  const selectedCapture = dailyEvents.find((event) => event.id === selectedCaptureId) ?? active[0] ?? metrics.completed.at(-1)
  const captureModalEvent = allEvents.find((event) => event.id === captureModalId)
  const recentCaptures = dailyEvents.filter((event) => event.entryCapturedAt !== undefined).sort((a, b) => (b.exitCapturedAt ?? b.entryCapturedAt ?? 0) - (a.exitCapturedAt ?? a.entryCapturedAt ?? 0)).slice(0, 4)

  const filteredEvents = dailyEvents
    .filter((event) => sizeFilter === 'all' || event.size === sizeFilter)
    .filter((event) => !reviewOnly || event.confidence < 0.8)
    .filter((event) => `${event.code} ${event.cameraId ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.arrival - a.arrival)

  const navigate = (view: View) => { setActiveView(view); setMobileMenu(false); if (view !== 'operations') setReviewOnly(false) }
  const addVehicle = () => {
    const vehicle = createVehicle(events, clock, newSize)
    setEvents(advanceSimulation([...events, vehicle], clock, 0).events)
    setSelectedCaptureId(vehicle.id); setCapturePhase('entry'); setAddOpen(false)
    toast.success(t('{code} entered automatic monitoring', { code: vehicle.code }))
  }
  const updateEventSize = (id: string, size: VehicleSize) => {
    const target = allEvents.find((event) => event.id === id)
    if (target?.source === 'vision') {
      correctSizeMutation.mutate({ id: Number(id.replace('server-', '')), size }, {
        onSuccess: () => { utils.events.list.invalidate(); toast.success(t('Classification corrected and profitability recalculated')) },
        onError: () => toast.error(t('Could not correct the saved classification')),
      })
      return
    }
    setEvents((current) => current.map((event) => event.id === id ? { ...event, size, confidence: 1, price: settings.prices[size], cost: settings.variableCosts[size] } : event))
    toast.success(t('Classification corrected and profitability recalculated'))
  }
  const exportCsv = () => {
    const header = [t('Operation ID'), t('Size'), t('Status'), t('Camera'), t('Entry time'), t('Exit time'), t('Duration'), t('Bay'), t('Confidence')]
    const rows = dailyEvents.map((event) => [event.code, sizeText(event.size), statusText(event.status), event.cameraId ?? '', minutesToTime(event.entry), event.exit ? minutesToTime(event.exit) : '', event.exit ? event.exit - event.entry : '', event.bay ?? '', `${Math.round(event.confidence * 100)}%`])
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'mirsad-operations.csv'
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success(t('Daily record exported'))
  }
  const saveSettings = () => {
    if (FRONTEND_DEMO) {
      setSettingsDraft(settings)
      toast.success(t('Settings saved for this demo session'))
      return
    }
    saveSettingsMutation.mutate(settings, { onSuccess: () => toast.success(t('Prices and costs saved to the database')), onError: () => toast.error(t('Could not save settings')) })
  }
  const updateSetting = (group: 'prices' | 'variableCosts' | 'targets', size: VehicleSize, value: number) => setSettingsDraft({ ...settings, [group]: { ...settings[group], [size]: Math.max(0, value) } })
  const resetDemo = () => { setEvents(createInitialEvents()); setClock(INITIAL_CLOCK); setRunning(false); setSelectedCaptureId('wash-35'); toast.success(t('Simulation reset to its starting point')) }
  const openCapture = (event: WashEvent) => { setSelectedCaptureId(event.id); setCapturePhase(event.status === 'completed' ? 'exit' : 'entry') }
  const dateText = new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  const statusLabel = (status: WashStatus) => statusText(status)

  return <div className="app-shell" dir={direction}>
    <Toaster position="bottom-left" theme={theme} richColors />
    {mobileMenu && <button className="menu-backdrop" aria-label={t('Close menu')} onClick={() => setMobileMenu(false)} />}
    <aside className={`sidebar ${mobileMenu ? 'is-open' : ''}`}>
      <div className="brand"><BrandMark /><div><strong>{t('Mirsad')}</strong><span>{t('Smart car wash management')}</span></div></div>
      <div className="branch-label"><span className="status-dot" />{t('Al Nada Branch')}<span>{running ? t('Automatic') : t('Paused')}</span></div>
      <nav aria-label={t('Main navigation')}>{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={activeView === id ? 'active' : ''} onClick={() => navigate(id)} aria-current={activeView === id ? 'page' : undefined}><Icon size={19} strokeWidth={1.7} /><span>{t(label)}</span>{activeView === id && <ChevronLeft size={15} className="nav-chevron" />}</button>)}</nav>
      <div className="sidebar-insight"><Camera size={18} /><strong>{t('Automatic captures')}</strong><p>{t('Entry and exit images share one vehicle record and one duration calculation.')}</p><button onClick={() => navigate('integration')}>{t('Connection status')}<ChevronLeft size={14} className="nav-chevron" /></button></div>
      <div className="local-note"><span className="status-dot" />{FRONTEND_DEMO ? t('Interactive demo · session only') : eventsQuery.data ? t('Database connected') : t('Connecting to database')}</div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="topbar-title"><button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label={t('Open menu')}><Menu size={21} /></button><div><h1>{t(viewTitles[activeView])}</h1><p>{dateText}</p></div></div>
        <div className="topbar-actions">
          <div className="preference-controls">
            <button className="icon-button preference-button" onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')} aria-label={t('Switch language')} title={t('Switch language')}><Languages size={17} /><span>{language === 'ar' ? 'EN' : 'عربي'}</span></button>
            <button className="icon-button preference-button theme-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? t('Switch to light theme') : t('Switch to dark theme')} title={theme === 'dark' ? t('Switch to light theme') : t('Switch to dark theme')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
          </div>
          <div className="sim-clock"><span className={`status-dot ${running ? 'pulse' : ''}`} /><div><span>{running ? t('Automatic monitoring is running') : t('Simulation paused')}</span><strong dir="ltr">{minutesToTime(clock)}</strong></div></div>
          <button className="secondary-button export-button" onClick={exportCsv}><Download size={17} /><span>{t('Export')}</span></button><button className="primary-button" onClick={() => setAddOpen(true)}><Plus size={18} /><span>{t('Add vehicle')}</span></button>
        </div>
      </header>

      <div className="page-content">
        {activeView === 'overview' && <>
          <section className="overview-intro simple"><div><span className="live-label"><Activity size={14} />{t('Entry, exit, and classification without manual input')}</span><h2>{t('Every vehicle. Two captures. One precise duration.')}</h2><p>{t('Monitor the site and review every wash by image, time, and cost.')}</p></div><div className="simulation-controls" aria-label={t('Simulation controls')}><button className="play-button" onClick={() => setRunning((value) => !value)}>{running ? <Pause size={17} /> : <Play size={17} />}{running ? t('Pause') : t('Play')}</button><div className="speed-control">{[1, 4, 12].map((value) => <button key={value} className={speed === value ? 'active' : ''} onClick={() => setSpeed(value)} aria-label={t('Speed {value}x', { value })}>{value}×</button>)}</div></div></section>
          <section className="kpi-grid">
            <article className="kpi-card tone-mint"><div className="kpi-top"><span>{t('Cars today')}</span><CarFront size={18} /></div><strong>{number(dailyEvents.length)}</strong><p>{t('{completed} completed · {active} active now', { completed: number(metrics.completed.length), active: number(active.length) })}</p></article>
            <article className="kpi-card tone-cyan"><div className="kpi-top"><span>{t('Average wash duration')}</span><Clock3 size={18} /></div><strong>{decimal(metrics.averageDuration)} {t('min')}</strong><p>{t('From entry capture to exit capture')}</p></article>
            <article className="kpi-card tone-plain"><div className="kpi-top"><span>{t('Revenue earned')}</span><CircleDollarSign size={18} /></div><strong>{money(metrics.revenue)}</strong><p>{t('Completed operations only')}</p></article>
            <article className="kpi-card tone-amber"><div className="kpi-top"><span>{t('Net profit today')}</span><TrendingUp size={18} /></div><strong>{money(metrics.netProfit)}</strong><p>{t('After variable and fixed costs')}</p></article>
          </section>

          <div className="live-monitor-grid">
            <section className="panel bay-panel">
              <SectionHead title={t('Wash bays now')} subtitle={t('{active} of {total} bays occupied', { active: number(active.length), total: number(BAY_COUNT) })} action={<span className="utilization"><Gauge size={15} />{t('Utilization {value}%', { value: decimal(metrics.utilization) })}</span>} />
              <div className="bays-grid">{Array.from({ length: BAY_COUNT }, (_, index) => index + 1).map((bay) => {
                const event = active.find((item) => item.bay === bay)
                const elapsed = event ? Math.max(0, clock - event.entry) : 0
                const progress = event ? Math.min(100, (elapsed / event.plannedDuration) * 100) : 0
                const isDelayed = event ? elapsed > settings.targets[event.size] : false
                return <button key={bay} className={`bay-card ${event ? 'occupied' : ''} ${selectedBay === bay ? 'selected' : ''}`} onClick={() => { setSelectedBay(bay); if (event) openCapture(event) }}><div className="bay-card-head"><span>{t('Bay {number}', { number: number(bay) })}</span><span className={`bay-status ${isDelayed ? 'warning' : ''}`}><i />{event ? (isDelayed ? t('Above target') : t('Washing')) : t('Available')}</span></div><div className="bay-scene"><span className="bay-line one" /><span className="bay-line two" />{event ? <VehicleVisual size={event.size} /> : <CarFront className="empty-car" size={32} strokeWidth={1} />}</div>{event ? <><div className="bay-vehicle"><strong dir="ltr">{event.code}</strong><span>{sizeText(event.size)}</span></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="bay-time"><span>{t('{value} minutes', { value: number(Math.floor(elapsed)) })}</span><span>{t('Target {value} min', { value: number(settings.targets[event.size]) })}</span></div></> : <div className="available-copy">{t('Ready for the next vehicle')}</div>}</button>
              })}</div>
              <div className="auto-event-strip"><span className="status-dot pulse" /><strong>{t('Automatic analysis')}</strong><span>{t('Vehicle detection')}</span><ChevronLeft size={13} className="nav-chevron" /><span>{t('Track matching')}</span><ChevronLeft size={13} className="nav-chevron" /><span>{t('Duration and profit calculation')}</span></div>
            </section>

            <section className="panel focus-capture-panel">
              <SectionHead title={t('Vehicle under review')} subtitle={t('Capture and analysis in one place')} action={selectedCapture && <span className={`table-status ${selectedCapture.status}`}><i />{statusLabel(selectedCapture.status)}</span>} />
              {selectedCapture ? <>
                <CameraCapture event={selectedCapture} phase={selectedCapture.status === 'completed' && capturePhase === 'exit' ? 'exit' : 'entry'} />
                <div className="capture-phase-tabs"><button className={capturePhase === 'entry' ? 'active' : ''} onClick={() => setCapturePhase('entry')}>{t('Entry image')}</button><button disabled={selectedCapture.status !== 'completed'} className={capturePhase === 'exit' ? 'active' : ''} onClick={() => setCapturePhase('exit')}>{t('Exit image')}</button></div>
                <div className="capture-analysis"><div><span>{t('Operation ID')}</span><strong dir="ltr">{selectedCapture.code}</strong></div><div><span>{t('Vehicle size')}</span><strong>{sizeText(selectedCapture.size)} · {number(Math.round(selectedCapture.confidence * 100))}{percentSign}</strong></div><div><span>{t('Stay duration')}</span><strong>{selectedCapture.exit ? t('{value} minutes', { value: number(selectedCapture.exit - selectedCapture.entry) }) : t('{value} minutes so far', { value: number(Math.max(0, Math.floor(clock - selectedCapture.entry))) })}</strong></div><div><span>{t('Value on completion')}</span><strong>{money(selectedCapture.price ?? settings.prices[selectedCapture.size])}</strong></div></div>
                <button className="text-button full" onClick={() => setCaptureModalId(selectedCapture.id)}>{t('View both captures and details')}<ChevronLeft size={15} className="nav-chevron" /></button>
              </> : <EmptyState text={t('No vehicle is being monitored')} />}
            </section>
          </div>

          <section className="panel recent-captures-panel"><SectionHead title={t('Latest captures')} subtitle={t('Select any vehicle to review entry and exit')} action={<button className="text-button" onClick={() => navigate('operations')}>{t('All records')}<ChevronLeft size={14} className="nav-chevron" /></button>} /><div className="capture-gallery">{recentCaptures.map((event) => <button key={event.id} onClick={() => setCaptureModalId(event.id)}><CameraCapture event={event} phase={event.status === 'completed' ? 'exit' : 'entry'} compact /><div><strong>{sizeText(event.size)}</strong><span>{event.exit ? t('{value} minutes', { value: number(event.exit - event.entry) }) : t('Washing')}</span></div></button>)}</div></section>
          <div className="overview-bottom-row"><button className="alert-row" onClick={() => { setReviewOnly(true); setActiveView('operations') }}><AlertTriangle size={18} /><div><strong>{t('{count} classifications need review', { count: number(reviewCount) })}</strong><span>{t('Confidence below 80%')}</span></div><ChevronLeft size={16} className="nav-chevron" /></button><div className="alert-row neutral"><TimerReset size={18} /><div><strong>{delayed.length ? t('{count} delayed operations', { count: number(delayed.length) }) : t('Durations within target')}</strong><span>{t('{count} vehicles waiting', { count: number(queued.length) })}</span></div></div></div>
        </>}

        {activeView === 'operations' && <section className="panel operations-panel">
          <SectionHead title={t('A clear record for every vehicle')} subtitle={t('Image, camera, size, and duration are linked to the same operation')} action={<button className="secondary-button" onClick={exportCsv}><Download size={16} />CSV</button>} />
          <div className="table-toolbar"><label className="search-field"><span>{t('Search by operation ID or camera')}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="W-1035 / CAM-DEMO" dir="ltr" /></label><label><span>{t('Vehicle size')}</span><select value={sizeFilter} onChange={(event) => setSizeFilter(event.target.value as 'all' | VehicleSize)}><option value="all">{t('All sizes')}</option>{(['small', 'medium', 'large'] as VehicleSize[]).map((size) => <option key={size} value={size}>{sizeText(size)}</option>)}</select></label><label className="review-toggle"><input type="checkbox" checked={reviewOnly} onChange={(event) => setReviewOnly(event.target.checked)} /><span>{t('Low confidence only')}</span></label></div>
          <div className="table-meta"><span>{t('Showing {count} operations', { count: number(filteredEvents.length) })}</span>{(search || sizeFilter !== 'all' || reviewOnly) && <button onClick={() => { setSearch(''); setSizeFilter('all'); setReviewOnly(false) }}>{t('Clear filters')}<X size={14} /></button>}</div>
          <div className="table-scroll"><table><thead><tr><th>{t('Operation')}</th><th>{t('Captures')}</th><th>{t('Status')}</th><th>{t('Size')}</th><th>{t('Camera')}</th><th>{t('Entry')}</th><th>{t('Duration')}</th><th>{t('Confidence')}</th></tr></thead><tbody>{filteredEvents.map((event) => {
            const duration = event.exit ? event.exit - event.entry : event.status === 'washing' ? Math.max(0, Math.floor(clock - event.entry)) : null
            return <tr key={event.id} className={event.confidence < 0.8 ? 'needs-review' : ''}><td><strong dir="ltr">{event.code}</strong>{event.confidence < 0.8 && <span className="review-flag">{t('Review')}</span>}</td><td><button className="capture-table-button" onClick={() => setCaptureModalId(event.id)}><Camera size={14} />{event.exitCapturedAt ? t('Two captures') : t('Entry')}</button></td><td><span className={`table-status ${event.status}`}><i />{statusLabel(event.status)}</span></td><td><select aria-label={t('Correct size for {code}', { code: event.code })} value={event.size} disabled={correctSizeMutation.isPending} onChange={(change) => updateEventSize(event.id, change.target.value as VehicleSize)}>{(['small', 'medium', 'large'] as VehicleSize[]).map((size) => <option key={size} value={size}>{sizeText(size)}</option>)}</select></td><td dir="ltr">{event.cameraId ?? '—'}</td><td dir="ltr">{minutesToTime(event.entry)}</td><td>{duration === null ? '—' : `${number(duration)} ${t('min')}`}</td><td><span className={event.confidence < 0.8 ? 'low-confidence' : ''}>{number(Math.round(event.confidence * 100))}{percentSign}</span></td></tr>
          })}</tbody></table>{filteredEvents.length === 0 && <EmptyState text={t('No matching operations')} />}</div>
        </section>}

        {activeView === 'reports' && <ReportsView events={allEvents} settings={settings} onEditSettings={() => navigate('settings')} />}
        {activeView === 'integration' && <IntegrationView serverReady={!FRONTEND_DEMO && !!eventsQuery.data} demoMode={FRONTEND_DEMO} onEvent={() => utils.events.list.invalidate()} />}

        {activeView === 'settings' && <div className="settings-layout">
          <section className="panel settings-panel"><SectionHead title={t('Wash pricing')} subtitle={t('Stored with each operation at entry')} /><div className="settings-rows">{(['small', 'medium', 'large'] as VehicleSize[]).map((size) => <label key={size}><span><strong>{sizeText(size)}</strong><small>{t('Price per wash')}</small></span><div className="number-input"><input type="number" min="0" value={settings.prices[size]} onChange={(event) => updateSetting('prices', size, Number(event.target.value))} /><span>{t('SAR')}</span></div></label>)}</div></section>
          <section className="panel settings-panel"><SectionHead title={t('Variable cost')} subtitle={t('Materials and operation per wash')} /><div className="settings-rows">{(['small', 'medium', 'large'] as VehicleSize[]).map((size) => <label key={size}><span><strong>{sizeText(size)}</strong><small>{t('Cost per wash')}</small></span><div className="number-input"><input type="number" min="0" value={settings.variableCosts[size]} onChange={(event) => updateSetting('variableCosts', size, Number(event.target.value))} /><span>{t('SAR')}</span></div></label>)}</div></section>
          <section className="panel settings-panel"><SectionHead title={t('Target durations')} subtitle={t('Used for delay alerts')} /><div className="settings-rows">{(['small', 'medium', 'large'] as VehicleSize[]).map((size) => <label key={size}><span><strong>{sizeText(size)}</strong><small>{t('From entry to exit')}</small></span><div className="number-input"><input type="number" min="1" value={settings.targets[size]} onChange={(event) => updateSetting('targets', size, Math.max(1, Number(event.target.value)))} /><span>{t('Minutes')}</span></div></label>)}</div></section>
          <section className="panel settings-panel"><SectionHead title={t('Daily expenses')} subtitle={t('Included in daily, monthly, and annual reports')} /><div className="settings-rows"><label><span><strong>{t('Fixed expenses')}</strong><small>{t('Daily rent and operation')}</small></span><div className="number-input"><input type="number" min="0" value={settings.fixedDaily} onChange={(event) => setSettingsDraft({ ...settings, fixedDaily: Math.max(0, Number(event.target.value)) })} /><span>{t('SAR')}</span></div></label><label><span><strong>{t('Labor cost')}</strong><small>{t('Daily total')}</small></span><div className="number-input"><input type="number" min="0" value={settings.laborDaily} onChange={(event) => setSettingsDraft({ ...settings, laborDaily: Math.max(0, Number(event.target.value)) })} /><span>{t('SAR')}</span></div></label></div></section>
          <div className="settings-actions"><button className="primary-button" disabled={saveSettingsMutation.isPending} onClick={saveSettings}><Check size={17} />{saveSettingsMutation.isPending ? t('Saving…') : t('Save settings')}</button><button className="secondary-button" onClick={() => { setSettingsDraft(defaultSettings); toast.success(t('Defaults restored; select save to apply them')) }}><RotateCcw size={16} />{t('Restore defaults')}</button></div>
          <section className="demo-data-row"><div><strong>{t('Monitoring simulation data')}</strong><p>{t('Saved historical records and model events are not affected.')}</p></div><button className="secondary-button" onClick={resetDemo}><RotateCcw size={16} />{t('Reset simulation')}</button></section>
        </div>}
      </div>
      <footer className="app-footer"><span>{t('Mirsad · automatic monitoring and analysis')}</span><span>{t(FRONTEND_DEMO ? 'Current scenes are simulated · demo data only · no live camera or database connection' : 'Current scenes are simulated · model events and historical reports are stored in the database')}</span></footer>
    </main>

    <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent className="vehicle-dialog" dir={direction} showCloseButton={false}><DialogHeader><DialogTitle>{t('Add vehicle to monitoring')}</DialogTitle><DialogDescription>{t('An entry image is captured automatically when a wash bay becomes available.')}</DialogDescription></DialogHeader><div className="size-options">{(['small', 'medium', 'large'] as VehicleSize[]).map((size) => <button key={size} className={newSize === size ? 'active' : ''} onClick={() => setNewSize(size)}><VehicleVisual size={size} muted={newSize !== size} /><strong>{sizeText(size)}</strong><span>{t('Target {value} minutes', { value: number(settings.targets[size]) })}</span></button>)}</div><div className="dialog-actions"><button className="secondary-button" onClick={() => setAddOpen(false)}>{t('Cancel')}</button><button className="primary-button" onClick={addVehicle}><Plus size={17} />{t('Start monitoring')}</button></div></DialogContent></Dialog>

    <Dialog open={!!captureModalEvent} onOpenChange={(open) => { if (!open) setCaptureModalId(null) }}><DialogContent className="capture-dialog" dir={direction} showCloseButton={false}>{captureModalEvent && <><DialogHeader><DialogTitle>{t('Vehicle record')} <span dir="ltr">{captureModalEvent.code}</span></DialogTitle><DialogDescription>{sizeText(captureModalEvent.size)} · {captureModalEvent.cameraId ?? t('Bay camera')} · {t('confidence {value}%', { value: number(Math.round(captureModalEvent.confidence * 100)) })}</DialogDescription></DialogHeader><div className="dual-captures"><div><span>{t('1. Entry')}</span><CameraCapture event={captureModalEvent} phase="entry" /></div><div><span>{t('2. Exit')}</span>{captureModalEvent.exitCapturedAt !== undefined ? <CameraCapture event={captureModalEvent} phase="exit" /> : <div className="pending-capture"><Activity size={25} /><strong>{t('Vehicle is still in the bay')}</strong><span>{t('Exit image will be captured automatically')}</span></div>}</div></div><div className="capture-modal-stats"><div><span>{t('Entry time')}</span><strong dir="ltr">{minutesToTime(captureModalEvent.entry)}</strong></div><div><span>{t('Exit time')}</span><strong dir="ltr">{captureModalEvent.exit ? minutesToTime(captureModalEvent.exit) : '—'}</strong></div><div><span>{t('Stay duration')}</span><strong>{captureModalEvent.exit ? t('{value} minutes', { value: number(captureModalEvent.exit - captureModalEvent.entry) }) : t('Calculating')}</strong></div><div><span>{t('Net wash contribution')}</span><strong>{captureModalEvent.status === 'completed' ? money((captureModalEvent.price ?? settings.prices[captureModalEvent.size]) - (captureModalEvent.cost ?? settings.variableCosts[captureModalEvent.size])) : t('After exit')}</strong></div></div><div className="dialog-actions"><button className="primary-button" onClick={() => setCaptureModalId(null)}>{t('Done')}</button></div></>}</DialogContent></Dialog>
  </div>
}
