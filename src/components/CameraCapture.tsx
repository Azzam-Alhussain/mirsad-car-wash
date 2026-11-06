import { Camera, ScanLine } from 'lucide-react'
import type { WashEvent } from '../types'
import { minutesToTime } from '../lib/simulation'
import { usePreferences } from '../providers/preferences'

export function CameraCapture({ event, phase, compact = false }: { event: WashEvent; phase: 'entry' | 'exit'; compact?: boolean }) {
  const { t } = usePreferences()
  const timestamp = phase === 'entry' ? event.entryCapturedAt : event.exitCapturedAt
  const imageUrl = phase === 'entry' ? event.entryImageUrl : event.exitImageUrl
  const phaseText = phase === 'entry' ? t('Entry') : t('Exit')
  const carWidth = event.size === 'small' ? 130 : event.size === 'medium' ? 154 : 176
  const carHeight = event.size === 'large' ? 57 : 48
  return (
    <div className={`camera-capture ${compact ? 'compact' : ''}`}>
      {imageUrl ? <img src={imageUrl} alt={t('{phase} capture for {code}', { phase: phaseText, code: event.code })} /> : event.source === 'vision' ? <div className="missing-capture"><Camera size={24} /><span>{t('The model did not provide an image URL')}</span></div> : <svg viewBox="0 0 320 180" role="img" aria-label={t('Simulated capture for vehicle {code}', { code: event.code })}>
        <defs>
          <linearGradient id={`road-${phase}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#172337" /><stop offset="1" stopColor="#0b1220" /></linearGradient>
          <linearGradient id={`car-${phase}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={event.size === 'large' ? '#d6a957' : event.size === 'medium' ? '#77a9ba' : '#7fb5aa'} /><stop offset="1" stopColor="#31445a" /></linearGradient>
        </defs>
        <rect width="320" height="180" fill={`url(#road-${phase})`} />
        <path d="M0 126H320M0 151H320" stroke="#607089" strokeOpacity=".25" />
        <path d="M30 180L78 110M290 180L242 110" stroke="#8b98aa" strokeOpacity=".28" strokeDasharray="7 7" />
        <path d="M0 40H320M45 0V85M275 0V85" stroke="#4b5c74" strokeOpacity=".18" />
        <g transform={`translate(${160 - carWidth / 2} ${103 - carHeight})`}>
          <path d={`M12 ${carHeight}L20 28Q28 18 48 14L72 2H${carWidth - 54}Q${carWidth - 34} 4 ${carWidth - 22} 22L${carWidth - 4} 31V${carHeight}Z`} fill={`url(#car-${phase})`} stroke="#b8c6d8" strokeOpacity=".45" />
          <path d={`M53 16L76 6H${carWidth - 58}L${carWidth - 35} 20Z`} fill="#152234" opacity=".85" />
          <circle cx="42" cy={carHeight} r="13" fill="#0a0f18" stroke="#65758b" strokeWidth="4" />
          <circle cx={carWidth - 37} cy={carHeight} r={13} fill="#0a0f18" stroke="#65758b" strokeWidth="4" />
          <rect x={carWidth - 12} y={30} width={8} height={6} rx={2} fill="#f0c875" />
        </g>
        <g stroke="#34d399" strokeOpacity=".55" fill="none"><path d="M45 58V42H61M275 58V42H259M45 120V136H61M275 120V136H259" /></g>
      </svg>}
      <div className="capture-top"><span><Camera size={12} />{event.cameraId ?? `CAM-${event.bay ?? 1}`}</span><span className="capture-rec"><i />{phaseText.toUpperCase()}</span></div>
      <div className="capture-bottom"><strong dir="ltr">{event.code}</strong><span dir="ltr">{timestamp !== undefined ? minutesToTime(timestamp) : '—'}</span></div>
      {!compact && <span className="capture-scan"><ScanLine size={13} />{t('Automatic capture')}</span>}
    </div>
  )
}
