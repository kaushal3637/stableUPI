import { UPIData, UPIValidationResult, MerchantInfo } from '@/types/upi.types'

/**
 * Parse UPI QR Code Data
 * @param qrData The raw QR code data string
 * @returns Parsed UPI data or null if not a valid UPI QR
 */
export function parseUPIQR(qrData: string): UPIData | null {
  try {
    // Check if it's a UPI URL
    if (!qrData.startsWith('upi://pay?')) {
      return null
    }

    // Parse UPI URL parameters
    const url = new URL(qrData)
    const params = new URLSearchParams(url.search)

    const upiData: UPIData = {
      upiId: params.get('pa') || '',
      name: params.get('pn') || undefined,
      amount: params.get('am') || undefined,
      currency: params.get('cu') || 'INR',
      transactionNote: params.get('tn') || undefined,
      merchantCode: params.get('mc') || undefined,
      merchantType: params.get('mt') || undefined,
      transactionRef: params.get('tr') || undefined,
      url: params.get('url') || undefined,
      isValid: false
    }

    // Validate required fields
    if (!upiData.upiId) {
      upiData.validationMessage = 'Missing UPI ID'
      return upiData
    }

    // Validate UPI ID format
    const upiIdRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/
    if (!upiIdRegex.test(upiData.upiId)) {
      upiData.validationMessage = 'Invalid UPI ID format'
      return upiData
    }

    // Check for merchant indicators
    if (upiData.merchantCode || upiData.merchantType) {
      upiData.merchantName = upiData.name
    }

    upiData.isValid = true
    upiData.validationMessage = 'Valid UPI QR Code'

    return upiData
  } catch (error) {
    console.error('Error parsing UPI QR:', error)
    return null
  }
}

/**
 * Validate UPI ID format
 * @param upiId The UPI ID to validate
 * @returns boolean indicating if UPI ID is valid
 */
export function validateUPIId(upiId: string): boolean {
  const upiIdRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/
  return upiIdRegex.test(upiId)
}

/**
 * Extract merchant information from UPI data
 * @param upiData Parsed UPI data
 * @returns Merchant information if available
 */
export function extractMerchantInfo(upiData: UPIData): MerchantInfo | null {
  if (!upiData.isValid) return null

  // Determine if this is a merchant or personal UPI
  const isMerchant = Boolean(upiData.merchantCode || upiData.merchantType ||
                           (upiData.name && upiData.name.includes('Merchant')) ||
                           (upiData.upiId.includes('merchant') || upiData.upiId.includes('biz')))

  if (isMerchant) {
    return {
      name: upiData.merchantName || upiData.name || 'Unknown Merchant',
      upiId: upiData.upiId,
      type: 'merchant',
      category: upiData.merchantType || 'General',
      verified: Boolean(upiData.merchantCode),
      description: upiData.transactionNote || undefined
    }
  } else {
    return {
      name: upiData.name || 'Personal Account',
      upiId: upiData.upiId,
      type: 'personal',
      description: upiData.transactionNote || undefined
    }
  }
}

/**
 * Validate QR code and extract UPI information
 * @param qrData Raw QR code data
 * @returns Validation result with UPI data and merchant info
 */
export function validateUPIQR(qrData: string): UPIValidationResult {
  try {
    // First, try to parse as UPI QR
    const upiData = parseUPIQR(qrData)

    if (!upiData) {
      return {
        isValid: false,
        error: 'Not a valid UPI QR code. Please scan a UPI payment QR code.'
      }
    }

    if (!upiData.isValid) {
      return {
        isValid: false,
        upiData,
        error: upiData.validationMessage || 'Invalid UPI QR code format'
      }
    }

    // Extract merchant information
    const merchantInfo = extractMerchantInfo(upiData)

    return {
      isValid: true,
      upiData,
      merchantInfo
    }
  } catch (error) {
    console.error('UPI validation error:', error)
    return {
      isValid: false,
      error: 'Failed to validate QR code. Please try again.'
    }
  }
}

/**
 * Format UPI amount for display
 * @param amount Raw amount string
 * @param currency Currency code
 * @returns Formatted amount string
 */
export function formatUPIAmount(amount: string | undefined, currency: string = 'INR'): string {
  if (!amount) return 'Amount not specified'

  const numAmount = parseFloat(amount)
  if (isNaN(numAmount)) return amount

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2
  }).format(numAmount)
}

/**
 * Get UPI app name from UPI ID
 * @param upiId UPI ID
 * @returns App name if recognizable, otherwise null
 */
export function getUPIAppName(upiId: string): string | null {
  const domain = upiId.split('@')[1]?.toLowerCase()

  if (!domain) return null

  const appMap: Record<string, string> = {
    'paytm.com': 'Paytm',
    'okhdfcbank': 'HDFC Bank',
    'okicici': 'ICICI Bank',
    'oksbi': 'SBI',
    'okaxis': 'Axis Bank',
    'okhdfc': 'HDFC Bank',
    'ybl': 'Yes Bank',
    'ibl': 'IDBI Bank',
    'rbl': 'RBL Bank',
    'federal': 'Federal Bank',
    'bandhan': 'Bandhan Bank'
  }

  return appMap[domain] || null
}
