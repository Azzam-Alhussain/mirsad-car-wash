export type VehicleSize = 'small' | 'medium' | 'large'
export type WashStatus = 'completed' | 'washing' | 'queued'
export type View = 'overview' | 'operations' | 'reports' | 'integration' | 'settings'
export type ReportPeriod = 'daily' | 'monthly' | 'yearly'

export interface WashEvent {
  id: string
  code: string
  size: VehicleSize
  arrival: number
  entry: number
  exit?: number
  bay?: number
  status: WashStatus
  confidence: number
  plannedDuration: number
  dayKey?: string
  cameraId?: string
  entryCapturedAt?: number
  exitCapturedAt?: number
  entryImageUrl?: string | null
  exitImageUrl?: string | null
  price?: number
  cost?: number
  source?: 'simulation' | 'vision' | 'seed'
}

export interface Settings {
  prices: Record<VehicleSize, number>
  variableCosts: Record<VehicleSize, number>
  targets: Record<VehicleSize, number>
  fixedDaily: number
  laborDaily: number
}

export const sizeLabels: Record<VehicleSize, string> = {
  small: 'صغيرة',
  medium: 'متوسطة',
  large: 'كبيرة',
}

export const statusLabels: Record<WashStatus, string> = {
  completed: 'مكتملة',
  washing: 'قيد الغسيل',
  queued: 'في الانتظار',
}
