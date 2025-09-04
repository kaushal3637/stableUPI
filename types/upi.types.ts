// UPI QR Code Data Structure
export interface UPIData {
  upiId: string
  name?: string
  merchantName?: string
  merchantCode?: string
  transactionRef?: string
  transactionNote?: string
  amount?: string
  currency?: string
  merchantType?: string
  location?: string
  url?: string
  isValid: boolean
  validationMessage?: string
}

// UPI Validation Result
export interface UPIValidationResult {
  isValid: boolean
  upiData?: UPIData
  error?: string
  merchantInfo?: MerchantInfo | null
}

// Merchant Information
export interface MerchantInfo {
  name: string
  upiId: string
  type: 'merchant' | 'personal'
  category?: string
  location?: string
  rating?: number
  verified?: boolean
  description?: string
}

// UPI QR Code Format (example template)
export type UPIQRFormat = 'upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tn=${tn}'

// Common UPI Apps
export const UPI_APPS = [
  'paytm',
  'gpay',
  'phonepe',
  'amazonpay',
  'bhim',
  'whatsapp',
  'cred',
  'mobikwik'
] as const

export type UPIApp = typeof UPI_APPS[number]

// UPI Transaction Status
export interface UPITransaction {
  id: string
  amount: number
  currency: string
  upiId: string
  merchantName?: string
  status: 'pending' | 'completed' | 'failed'
  timestamp: Date
  reference?: string
}
