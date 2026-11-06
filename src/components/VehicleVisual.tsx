import type { VehicleSize } from '../types'

export function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <svg className={small ? 'brand-mark small' : 'brand-mark'} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="15.5" stroke="currentColor" strokeOpacity=".28" />
      <path d="M20 4.5v6M20 29.5v6M4.5 20h6M29.5 20h6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="7" stroke="currentColor" strokeWidth="2" />
      <circle cx="20" cy="20" r="2.5" fill="currentColor" />
    </svg>
  )
}

export function VehicleVisual({ size, muted = false }: { size: VehicleSize; muted?: boolean }) {
  const length = size === 'small' ? 60 : size === 'medium' ? 70 : 80
  return (
    <svg className={`vehicle-visual ${muted ? 'muted' : ''}`} viewBox="0 0 100 110" fill="none" aria-hidden="true">
      <g transform={`translate(0 ${(80 - length) / 2})`}>
        <rect x="24" y={14 + (80 - length) / 2} width="52" height={length} rx="18" fill="currentColor" fillOpacity=".16" stroke="currentColor" strokeWidth="1.5" />
        <path d={`M31 ${32 + (80 - length) / 2}Q50 ${23 + (80 - length) / 2} 69 ${32 + (80 - length) / 2}L66 ${46 + (80 - length) / 2}H34Z`} fill="currentColor" fillOpacity=".28" />
        <path d={`M34 ${54 + (80 - length) / 2}H66L68 ${67 + (80 - length) / 2}Q50 ${73 + (80 - length) / 2} 32 ${67 + (80 - length) / 2}Z`} fill="currentColor" fillOpacity=".22" />
        <path d={`M50 ${28 + (80 - length) / 2}V${72 + (80 - length) / 2}`} stroke="currentColor" strokeOpacity=".18" />
        <rect x="18" y={29 + (80 - length) / 2} width="6" height="16" rx="3" fill="currentColor" fillOpacity=".5" />
        <rect x="76" y={29 + (80 - length) / 2} width="6" height="16" rx="3" fill="currentColor" fillOpacity=".5" />
        <rect x="18" y={58 + (80 - length) / 2} width="6" height="16" rx="3" fill="currentColor" fillOpacity=".5" />
        <rect x="76" y={58 + (80 - length) / 2} width="6" height="16" rx="3" fill="currentColor" fillOpacity=".5" />
      </g>
    </svg>
  )
}
