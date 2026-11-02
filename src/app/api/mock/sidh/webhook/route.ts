import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return NextResponse.json({
      received: true,
      timestamp: new Date().toISOString(),
      ack: "ack_mock_webhook_processed",
      mockNotice: "MOCK CONTRACT - Webhook event accepted in simulated environment.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
