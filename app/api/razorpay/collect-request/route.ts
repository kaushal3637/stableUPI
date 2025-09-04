import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { vpa, amount, currency = 'INR', description = 'Payment Request' } = await request.json()

    if (!vpa) {
      return NextResponse.json(
        { error: 'VPA (UPI ID) is required' },
        { status: 400 }
      )
    }

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Valid amount is required' },
        { status: 400 }
      )
    }

    try {
      // Create UPI collect request using Razorpay
      // Note: This is a conceptual implementation. Actual collect request creation
      // may vary based on your Razorpay plan and available APIs

      // For demonstration, we'll simulate collect request creation
      // In production, you would use actual Razorpay collect APIs

      const collectRequest = {
        id: `collect_${Date.now()}`,
        vpa: vpa,
        amount: amount,
        currency: currency,
        description: description,
        status: 'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        created_at: new Date().toISOString()
      }

      return NextResponse.json(collectRequest)

    } catch (razorpayError: unknown) {
      console.error('Razorpay collect request error:', razorpayError)

      const errorMessage = razorpayError instanceof Error ? razorpayError.message : 'Collect request creation failed'
      return NextResponse.json(
        {
          error: errorMessage
        },
        { status: 400 }
      )
    }

  } catch (error: unknown) {
    console.error('Collect request API error:', error)

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
