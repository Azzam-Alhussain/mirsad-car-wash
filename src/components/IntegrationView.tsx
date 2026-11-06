import { useState } from 'react'
import { Camera, Check, CheckCircle2, Clipboard, Code2, Cpu, Database, Play, RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/providers/trpc'
import { usePreferences } from '@/providers/preferences'

const example = {
  phase: 'entry', trackingId: 'CAM-BAY-01-a71c-42', cameraId: 'CAM-BAY-01',
  timestamp: '2026-11-06T14:32:00+03:00', size: 'medium', confidence: 0.96, bay: 1,
  imageUrl: 'https://camera-storage.example/captures/vehicle-2048-entry.jpg',
}

export function IntegrationView({ serverReady, demoMode, onEvent }: { serverReady: boolean; demoMode: boolean; onEvent: () => void }) {
  const [testing, setTesting] = useState(false)
  const [tested, setTested] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const { t, number } = usePreferences()
  const ping = trpc.ping.useQuery(undefined, { enabled: !demoMode, refetchInterval: demoMode ? false : 30000 })
  const copyPayload = async () => {
    await navigator.clipboard.writeText(JSON.stringify(example, null, 2))
    toast.success(t('Event payload copied'))
  }
  const testCycle = async () => {
    if (demoMode) return
    setTesting(true)
    try {
      const id = `demo-${Date.now()}`
      const exit = new Date()
      const entry = new Date(exit.getTime() - 24 * 60_000)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey.trim()) headers['x-api-key'] = apiKey.trim()
      const entryResponse = await fetch('/api/vision/events', { method: 'POST', headers, body: JSON.stringify({ phase: 'entry', trackingId: id, cameraId: 'CAM-DEMO', timestamp: entry.toISOString(), size: 'medium', confidence: 0.97, bay: 2 }) })
      if (!entryResponse.ok) throw new Error('entry failed')
      const exitResponse = await fetch('/api/vision/events', { method: 'POST', headers, body: JSON.stringify({ phase: 'exit', trackingId: id, cameraId: 'CAM-DEMO', timestamp: exit.toISOString() }) })
      if (!exitResponse.ok) throw new Error('exit failed')
      setTested(true)
      onEvent()
      toast.success(t('Entry and exit cycle completed and stored'))
    } catch { toast.error(t('Could not complete the test. Check the server, database, and API key.')) }
    finally { setTesting(false) }
  }
  return <>
    <section className="integration-hero">
      <div><span className="live-label"><Cpu size={14} />{t('Vision model integration API')}</span><h2>{t('From camera to profit record, automatically.')}</h2><p>{t('The model sends only two events: vehicle entry and exit. Mirsad matches them and calculates duration and finances.')}</p></div>
      <div className={`connection-state ${ping.data?.ok && serverReady ? 'online' : ''}`}><span className="status-dot" /><div><strong>{demoMode ? t('Live connection disabled in this demo') : ping.data?.ok && serverReady ? t('Server ready to receive events') : t('Checking server')}</strong><span>POST /api/vision/events</span></div></div>
    </section>
    <div className="flow-steps">
      <div><Camera size={21} /><span>{number(1)}</span><strong>{t('Camera')}</strong><p>{t('Entry image')} / {t('Exit image')}</p></div>
      <div><Cpu size={21} /><span>{number(2)}</span><strong>{t('Vision model')}</strong><p>{t('Tracking, size, and confidence')}</p></div>
      <div><Code2 size={21} /><span>{number(3)}</span><strong>{t('Standard event')}</strong><p>{t('One ID, timestamp, and image')}</p></div>
      <div><Database size={21} /><span>{number(4)}</span><strong>{t('Mirsad')}</strong><p>{t('Duration, profits, and reports')}</p></div>
    </div>
    <div className="integration-grid">
      <section className="panel api-panel">
        <div className="section-head"><div><h2>{t('Entry event format')}</h2><p>{t('JSON · send the same ID at exit')}</p></div><button className="icon-text-button" onClick={copyPayload}><Clipboard size={15} />{t('Copy')}</button></div>
        <pre dir="ltr"><code>{JSON.stringify(example, null, 2)}</code></pre>
        <div className="payload-note"><ShieldCheck size={16} /><span>{t('Images are optional secure HTTPS URLs. Exit requires phase, trackingId, cameraId, timestamp, and an optional imageUrl.')}</span></div>
        <div className="payload-note"><ShieldCheck size={16} /><span>{t('The included vision service supports RTSP cameras, YOLO detection, ByteTrack tracking, bay zones, and entry/exit events.')}</span></div>
      </section>
      <section className="panel readiness-panel">
        <div className="section-head"><div><h2>{t('Test a complete cycle')}</h2><p>{t('Entry followed by exit after a virtual 24 minutes')}</p></div></div>
        <ul className="check-list"><li><CheckCircle2 size={16} />{t('Match the vehicle by tracking ID')}</li><li><CheckCircle2 size={16} />{t('Calculate stay duration from timestamps')}</li><li><CheckCircle2 size={16} />{t('Store size, confidence, camera, and bay')}</li><li><CheckCircle2 size={16} />{t('Update revenue, cost, and profit')}</li></ul>
        {!demoMode && <label className="api-key-field"><span>{t('API key for this test')}</span><small>{t('Required only when VISION_API_KEY is configured')}</small><input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={t('Enter VISION_API_KEY')} dir="ltr" /></label>}
        {demoMode && <div className="payload-note"><ShieldCheck size={16} /><span>{t('Demo mode: settings last for this session; camera and database submission are disabled.')}</span></div>}
        <button className="primary-button full-button" onClick={testCycle} disabled={testing || demoMode}>{testing ? <RefreshCw className="spin" size={17} /> : tested ? <Check size={17} /> : <Play size={17} />}{demoMode ? t('Live camera test unavailable in demo') : testing ? t('Sending both events…') : tested ? t('Run test again') : t('Send test event')}</button>
        {tested && <div className="test-success"><CheckCircle2 size={16} />{t('Operation saved. Open Vehicle records and search for CAM-DEMO.')}</div>}
      </section>
    </div>
    <section className="integration-requirements"><strong>{t('Before field deployment')}</strong><span>{t('One fixed camera per bay')}</span><span>{t('Stable vehicle tracking ID')}</span><span>{t('Synchronized device time')}</span><span>{t('VISION_API_KEY and HTTPS required for public deployment')}</span></section>
  </>
}
