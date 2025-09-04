'use client'

import { useState, useEffect, useRef } from 'react'
import { QrCode, Camera, Wallet, CheckCircle, AlertCircle, Play, Square, User, Building, Shield } from 'lucide-react'
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library'
import { processUPIQRWithRazorpay } from '@/lib/razorpay-upi'
import { formatUPIAmount, getUPIAppName } from '@/lib/upi'
import { UPIData, MerchantInfo } from '@/types/upi.types'

export default function ScanPage() {
    const [isVisible, setIsVisible] = useState(false)
    const [isScanning, setIsScanning] = useState(false)
    const [scanResult, setScanResult] = useState<string | null>(null)
    const [upiData, setUpiData] = useState<UPIData | null>(null)
    const [merchantInfo, setMerchantInfo] = useState<MerchantInfo | null>(null)
    const [isValidUPI, setIsValidUPI] = useState<boolean>(false)
    const [error, setError] = useState<string | null>(null)
    const [hasPermission, setHasPermission] = useState<boolean | null>(null)
    const [isValidating, setIsValidating] = useState(false)

    const videoRef = useRef<HTMLVideoElement>(null)
    const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null)

    useEffect(() => {
        setIsVisible(true)

        return () => {
            stopScanning()
        }
    }, [])

    const requestCameraPermission = async (): Promise<boolean> => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            })

            stream.getTracks().forEach(track => track.stop())

            setHasPermission(true)
            return true
        } catch (err) {
            console.error('Camera permission denied:', err)
            setHasPermission(false)
            return false
        }
    }


    const startScanning = async () => {
        if (!videoRef.current) return

        setError(null)
        setScanResult(null)

        // First, request camera permission
        console.log('Requesting camera permission...')
        const permissionGranted = await requestCameraPermission()

        if (!permissionGranted) {
            setError('Camera permission is required to scan QR codes. Please allow camera access and try again.')
            return
        }

        console.log('Camera permission granted, starting scan...')

        try {
            // Initialize the code reader
            if (!codeReaderRef.current) {
                codeReaderRef.current = new BrowserMultiFormatReader()
                console.log('Code reader initialized')
            }

            // Get available video devices and find the back camera
            const videoInputDevices = await codeReaderRef.current.listVideoInputDevices()
            console.log('Available video devices:', videoInputDevices)

            if (videoInputDevices.length === 0) {
                throw new Error('No camera devices found')
            }

            // Find the back camera (environment facing)
            let selectedDevice = videoInputDevices.find(device =>
                device.label.toLowerCase().includes('back') ||
                device.label.toLowerCase().includes('rear') ||
                device.label.toLowerCase().includes('environment')
            )

            // If no back camera found, try to find one without "front" in the name
            if (!selectedDevice) {
                selectedDevice = videoInputDevices.find(device =>
                    !device.label.toLowerCase().includes('front') &&
                    !device.label.toLowerCase().includes('user')
                )
            }

            // Fallback to first device if we can't identify back camera
            if (!selectedDevice) {
                selectedDevice = videoInputDevices[0]
            }

            const selectedDeviceId = selectedDevice.deviceId
            console.log('Selected camera:', selectedDevice.label)
            console.log('All available cameras:', videoInputDevices.map(d => d.label))

            // Continuous scanning with better error handling
            console.log('Starting continuous QR scanning...')

            const scanWithRetry = async (attempts = 0): Promise<unknown> => {
                try {
                    if (!codeReaderRef.current) {
                        throw new Error('Code reader not initialized')
                    }

                    if (!videoRef.current) {
                        throw new Error('Video element not available')
                    }

                    console.log(`Scan attempt ${attempts + 1}`)
                    const result = await (codeReaderRef.current as BrowserMultiFormatReader).decodeOnceFromVideoDevice(selectedDeviceId, videoRef.current)

                    if (result) {
                        console.log('✅ QR Code successfully detected!')
                        return result
                    }
                } catch (scanError) {
                    console.log(`Scan attempt ${attempts + 1} failed:`, scanError)

                    // If it's not a "NotFoundException" (no QR found), it's a real error
                    if (!(scanError instanceof NotFoundException)) {
                        throw scanError
                    }

                    // Retry up to 3 times for NotFoundException
                    if (attempts < 3 && isScanning) {
                        console.log(`Retrying scan... (${attempts + 2}/4)`)
                        await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
                        return scanWithRetry(attempts + 1)
                    }

                    // Try with auto-selection as fallback
                    if (attempts >= 3) {
                        console.log('Trying auto camera selection...')
                        try {
                            if (!videoRef.current) {
                                throw new Error('Video element not available for auto-selection')
                            }
                            const result = await (codeReaderRef.current as BrowserMultiFormatReader).decodeOnceFromVideoDevice(undefined, videoRef.current)
                            if (result) {
                                console.log('✅ QR Code detected with auto-selection!')
                                return result
                            }
                        } catch (autoError) {
                            console.log('Auto-selection also failed:', autoError)
                        }
                    }

                    return null
                }
            }

            const result = await scanWithRetry()

            if (result) {
                const qrText = (result as { getText: () => string }).getText()
                console.log('📱 QR Code content:', qrText)
                console.log('📏 QR Code length:', qrText.length)
                setScanResult(qrText)
                setIsScanning(false)
                stopScanning()

                // Validate UPI QR code
                setIsValidating(true)
                console.log('🔍 Starting UPI validation...')

                try {
                    const validationResult = await processUPIQRWithRazorpay(qrText)
                    console.log('🔍 Validation result:', validationResult)

                    if (validationResult.isValid && validationResult.upiData) {
                        console.log('✅ Valid UPI QR code found!')
                        setUpiData(validationResult.upiData)
                        setMerchantInfo(validationResult.merchantInfo || null)
                        setIsValidUPI(true)
                        setError(null)
                        console.log('📊 UPI Data:', validationResult.upiData)
                        console.log('🏪 Merchant Info:', validationResult.merchantInfo)
                    } else {
                        console.log('❌ Invalid UPI QR code:', validationResult.error)
                        setIsValidUPI(false)
                        setUpiData(null)
                        setMerchantInfo(null)
                        setError(validationResult.error || 'This QR code is not a valid UPI payment code')
                    }
                } catch (validationError) {
                    console.error('❌ UPI validation failed:', validationError)
                    setIsValidUPI(false)
                    setUpiData(null)
                    setMerchantInfo(null)
                    setError('Failed to validate UPI QR code. Please try again.')
                } finally {
                    setIsValidating(false)
                }
            } else {
                console.log('❌ No QR code found after all attempts')
                setError('No QR code detected. Please ensure the QR code is clearly visible and try again.')
                setIsScanning(false)
                stopScanning()
            }
        } catch (err) {
            if (err instanceof NotFoundException) {
                console.log('No QR code found, continuing to scan...')
                // Continue scanning if no QR code found
                if (isScanning) {
                    setTimeout(() => startScanning(), 500)
                }
            } else {
                console.error('QR scanning error:', err)
                setError(`Camera error: ${err instanceof Error ? err.message : 'Unknown error'}`)
                setIsScanning(false)
                stopScanning()
            }
        }
    }

    const stopScanning = () => {
        if (codeReaderRef.current) {
            codeReaderRef.current.reset()
            codeReaderRef.current = null
        }
        setIsScanning(false)
    }

    const toggleScanning = async () => {
        if (isScanning) {
            stopScanning()
        } else {
            // If permission was previously denied, try to request it again
            if (hasPermission === false) {
                setError(null)
                setScanResult(null)
                const permissionGranted = await requestCameraPermission()
                if (permissionGranted) {
                    setIsScanning(true)
                    await startScanning()
                }
            } else {
                setIsScanning(true)
                await startScanning()
            }
        }
    }

    const resetScan = () => {
        setScanResult(null)
        setUpiData(null)
        setMerchantInfo(null)
        setIsValidUPI(false)
        setError(null)
        setIsScanning(false)
        setIsValidating(false)
        stopScanning()
    }

    return (
        <div className="min-h-screen bg-transparent">

            <div className={`relative z-10 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>

                {/* Main Content */}
                <div className="flex items-center justify-center px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
                    <div className="max-w-2xl mx-auto text-center">
                        {/* Header */}
                        <div className="mb-6 sm:mb-8">
                            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 mb-4 sm:mb-6">
                                <QrCode className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                            </div>
                            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 mb-4">
                                Scan Merchant QR
                            </h1>
                            <p className="text-base sm:text-lg md:text-xl text-slate-600 max-w-xl mx-auto px-4">
                                Scan the merchant&apos;s QR to start payment.
                            </p>
                        </div>

                        {/* QR Scanner */}
                        <div className="mb-8 sm:mb-12">
                            <div className="relative max-w-md mx-auto">
                                {/* Scanner Frame */}
                                <div className="relative bg-white rounded-2xl shadow-lg border-2 border-emerald-200 p-6 sm:p-8 overflow-hidden">
                                    {/* Video Element for Camera Feed */}
                                    <div className="relative bg-slate-900 rounded-lg overflow-hidden border-2 border-emerald-300">
                                        <video
                                            ref={videoRef}
                                            className={`w-full h-64 sm:h-80 object-cover ${!isScanning ? 'hidden' : ''}`}
                                            playsInline
                                            muted
                                        />

                                        {/* Placeholder when not scanning */}
                                        {!isScanning && !scanResult && !error && (
                                            <div className="w-full h-64 sm:h-80 flex items-center justify-center bg-slate-50">
                                                <div className="text-center">
                                                    <Camera className="w-12 h-12 sm:w-16 sm:h-16 text-slate-400 mx-auto mb-4" />
                                                    <h3 className="text-lg sm:text-xl font-semibold text-slate-700 mb-2">
                                                        Camera Ready
                                                    </h3>
                                                    <p className="text-sm sm:text-base text-slate-500">
                                                        Click start to begin scanning
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Scan Result Display */}
                                        {scanResult && (
                                            <div className="absolute inset-0 bg-white flex items-center justify-center p-4">
                                                <div className="w-full h-full overflow-y-auto">
                                                    {isValidating ? (
                                                        <div className="flex items-center justify-center h-full">
                                                            <div className="text-center">
                                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto mb-4"></div>
                                                                <p className="text-slate-600">Validating UPI...</p>
                                                            </div>
                                                        </div>
                                                    ) : isValidUPI && upiData && merchantInfo ? (
                                                        <div className="max-w-md mx-auto space-y-4">
                                                            {/* Success Header */}
                                                            <div className="text-center">
                                                                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-2" />
                                                                <h3 className="text-lg font-semibold text-green-800">Valid UPI QR Code</h3>
                                                                <p className="text-sm text-green-600">Ready for payment</p>
                                                            </div>

                                                            {/* Merchant/Person Info */}
                                                            <div className="bg-slate-50 rounded-lg p-4">
                                                                <div className="flex items-center gap-3 mb-3">
                                                                    {merchantInfo.type === 'merchant' ? (
                                                                        <Building className="w-6 h-6 text-blue-600" />
                                                                    ) : (
                                                                        <User className="w-6 h-6 text-purple-600" />
                                                                    )}
                                                                    <div>
                                                                        <h4 className="font-semibold text-slate-900">{merchantInfo.name}</h4>
                                                                        <p className="text-sm text-slate-600">{merchantInfo.type === 'merchant' ? 'Merchant' : 'Personal Account'}</p>
                                                                    </div>
                                                                </div>

                                                                {merchantInfo.verified && (
                                                                    <div className="flex items-center gap-2 text-sm text-green-600 mb-2">
                                                                        <Shield className="w-4 h-4" />
                                                                        <span>Verified Account</span>
                                                                    </div>
                                                                )}

                                                                <div className="space-y-2">
                                                                    <div className="flex justify-between">
                                                                        <span className="text-sm text-slate-600">UPI ID:</span>
                                                                        <span className="text-sm font-mono text-slate-900">{upiData.upiId}</span>
                                                                    </div>
                                                                    {upiData.amount && (
                                                                        <div className="flex justify-between">
                                                                            <span className="text-sm text-slate-600">Amount:</span>
                                                                            <span className="text-sm font-semibold text-emerald-600">
                                                                                {formatUPIAmount(upiData.amount, upiData.currency)}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                    {getUPIAppName(upiData.upiId) && (
                                                                        <div className="flex justify-between">
                                                                            <span className="text-sm text-slate-600">App:</span>
                                                                            <span className="text-sm text-slate-900">{getUPIAppName(upiData.upiId)}</span>
                                                                        </div>
                                                                    )}
                                                                    {upiData.transactionNote && (
                                                                        <div className="pt-2 border-t border-slate-200">
                                                                            <p className="text-xs text-slate-600">Note:</p>
                                                                            <p className="text-sm text-slate-900">{upiData.transactionNote}</p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Raw QR Data (Collapsible) */}
                                                            <details className="text-xs">
                                                                <summary className="cursor-pointer text-slate-600 hover:text-slate-800">
                                                                    View Raw QR Data
                                                                </summary>
                                                                <div className="mt-2 p-2 bg-slate-100 rounded text-xs font-mono break-all">
                                                                    {scanResult}
                                                                </div>
                                                            </details>
                                                        </div>
                                                    ) : (
                                                        <div className="max-w-md mx-auto text-center">
                                                            <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
                                                            <h3 className="text-lg font-semibold text-red-800 mb-2">Invalid QR Code</h3>
                                                            <p className="text-sm text-red-600 mb-4">
                                                                {error || 'This QR code is not a valid UPI payment code.'}
                                                            </p>
                                                            <button
                                                                onClick={resetScan}
                                                                className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm hover:bg-slate-700"
                                                            >
                                                                Scan Again
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Error Display */}
                                        {error && (
                                            <div className="absolute inset-0 bg-red-50 flex items-center justify-center">
                                                <div className="text-center p-4">
                                                    <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-red-600 mx-auto mb-4" />
                                                    <h3 className="text-lg sm:text-xl font-semibold text-red-800 mb-2">
                                                        Scanning Error
                                                    </h3>
                                                    <p className="text-sm sm:text-base text-red-700">
                                                        {error}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Control Buttons */}
                                    <div className="mt-4 flex gap-3 justify-center">
                                        {!scanResult && !error && (
                                            <button
                                                onClick={toggleScanning}
                                                disabled={hasPermission === false}
                                                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all duration-200 ${isScanning
                                                    ? 'bg-red-600 hover:bg-red-700 text-white'
                                                    : hasPermission === false
                                                        ? 'bg-orange-600 hover:bg-orange-700 text-white'
                                                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                                    } disabled:bg-slate-400 disabled:cursor-not-allowed`}
                                            >
                                                {isScanning ? (
                                                    <>
                                                        <Square className="w-4 h-4" />
                                                        Stop
                                                    </>
                                                ) : hasPermission === false ? (
                                                    <>
                                                        <Camera className="w-4 h-4" />
                                                        Request Permission
                                                    </>
                                                ) : (
                                                    <>
                                                        <Play className="w-4 h-4" />
                                                        Start Scan
                                                    </>
                                                )}
                                            </button>
                                        )}

                                        {(scanResult || error) && (
                                            <button
                                                onClick={resetScan}
                                                className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-full font-medium transition-all duration-200"
                                            >
                                                <QrCode className="w-4 h-4" />
                                                Scan Again
                                            </button>
                                        )}
                                    </div>

                                    {/* Permission Status */}
                                    <div className="mt-4 text-center">
                                        {hasPermission === false && (
                                            <div className="space-y-2">
                                                <p className="text-xs sm:text-sm text-red-600">
                                                    Camera access denied. Please allow camera access to continue.
                                                </p>
                                            </div>
                                        )}
                                        {hasPermission === null && (
                                            <p className="text-xs sm:text-sm text-slate-500">
                                                Camera access will be requested when you start scanning.
                                            </p>
                                        )}
                                        {hasPermission === true && (
                                            <p className="text-xs sm:text-sm text-green-600">
                                                Camera access granted ✓
                                            </p>
                                        )}
                                    </div>

                                    {/* Debug Info */}
                                    {process.env.NODE_ENV === 'development' && (
                                        <div className="mt-4 p-3 bg-slate-100 rounded text-xs max-w-xs mx-auto">
                                            <div className="font-semibold mb-2">🔧 Debug Panel</div>
                                            <div>📷 Scanning: {isScanning ? 'Active' : 'Inactive'}</div>
                                            <div>🔐 Permission: {hasPermission === null ? 'Not requested' : hasPermission ? '✅ Granted' : '❌ Denied'}</div>
                                            <div>🎥 Video Element: {videoRef.current ? '✅ Ready' : '❌ Not ready'}</div>
                                            <div>🔍 Validating: {isValidating ? 'Yes' : 'No'}</div>
                                            <div>💳 UPI Valid: {isValidUPI ? '✅ Yes' : '❌ No'}</div>

                                            <div className="mt-3 space-y-1">
                                                <button
                                                    onClick={() => setScanResult('upi://pay?pa=test@paytm&pn=Test%20Merchant&am=100.00&cu=INR&tn=Test%20Payment')}
                                                    className="px-2 py-1 bg-blue-500 text-white rounded text-xs mr-2 mb-1"
                                                >
                                                    Simulate UPI QR
                                                </button>
                                                <button
                                                    onClick={() => setScanResult('Test QR Code Data - This is a sample scan result')}
                                                    className="px-2 py-1 bg-green-500 text-white rounded text-xs mr-2 mb-1"
                                                >
                                                    Simulate Regular QR
                                                </button>
                                                <button
                                                    onClick={() => setHasPermission(null)}
                                                    className="px-2 py-1 bg-gray-500 text-white rounded text-xs"
                                                >
                                                    Reset Permission
                                                </button>
                                            </div>

                                            <div className="mt-3 p-2 bg-yellow-50 rounded text-xs">
                                                <div className="font-semibold text-yellow-800">💡 Troubleshooting Tips:</div>
                                                <ul className="mt-1 text-yellow-700 space-y-1">
                                                    <li>• Check browser console for detailed logs</li>
                                                    <li>• Ensure good lighting and QR code clarity</li>
                                                    <li>• Try different distances (6-12 inches)</li>
                                                    <li>• Make sure QR code isn&apos;t blurry or damaged</li>
                                                    <li>• Grant camera permissions when prompted</li>
                                                </ul>
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>
                        </div>

                        {/* Next Steps */}
                        <div className="bg-white/50 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-emerald-100">
                            {isValidUPI && upiData && merchantInfo ? (
                                <>
                                    <div className="flex items-center justify-center gap-3 mb-4">
                                        <Wallet className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-600" />
                                        <h3 className="text-lg sm:text-xl font-semibold text-slate-900">
                                            Ready to Pay
                                        </h3>
                                    </div>
                                    <p className="text-sm sm:text-base text-slate-600 mb-6 text-center">
                                        Valid UPI QR code detected. Connect your wallet to complete the payment.
                                    </p>
                                    <button className="w-full inline-flex items-center justify-center px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 rounded-full transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-emerald-500/25">
                                        Connect Wallet & Pay
                                    </button>
                                </>
                            ) : scanResult ? (
                                <>
                                    <div className="flex items-center justify-center gap-3 mb-4">
                                        <AlertCircle className="w-6 h-6 sm:w-7 sm:h-7 text-red-600" />
                                        <h3 className="text-lg sm:text-xl font-semibold text-slate-900">
                                            Invalid QR Code
                                        </h3>
                                    </div>
                                    <p className="text-sm sm:text-base text-slate-600 mb-6 text-center">
                                        This QR code is not a valid UPI payment code. Please scan a UPI QR code.
                                    </p>
                                    <button
                                        onClick={resetScan}
                                        className="w-full inline-flex items-center justify-center px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-semibold text-slate-700 border-2 border-emerald-200 rounded-full transition-all duration-300 hover:border-emerald-400 hover:bg-emerald-50"
                                    >
                                        Scan UPI QR Code
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="flex items-center justify-center gap-3 mb-4">
                                        <Wallet className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-600" />
                                        <h3 className="text-lg sm:text-xl font-semibold text-slate-900">
                                            Scan UPI QR Code
                                        </h3>
                                    </div>
                                    <p className="text-sm sm:text-base text-slate-600 mb-6 text-center">
                                        Point your camera at a UPI QR code to scan and validate payment information.
                                    </p>
                                    <div className="text-center">
                                        <p className="text-xs sm:text-sm text-slate-500 mb-4">
                                            Make sure your camera is enabled and pointed at the QR code
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
