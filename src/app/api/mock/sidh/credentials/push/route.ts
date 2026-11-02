import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clientTransactionId, credentialId, qualificationCode, signature } = body;

    if (!credentialId || !signature) {
      return NextResponse.json(
        { error: "credentialId and signature are required in mock payload" },
        { status: 400 }
      );
    }

    const sidhTrackingId = `sidh_mock_${Date.now().toString(36)}`;

    return NextResponse.json(
      {
        status: "ACCEPTED",
        sidhTrackingId,
        clientTransactionId,
        credentialId,
        queuedAt: new Date().toISOString(),
        mockNotice: "MOCK CONTRACT - Simulated sandbox acceptance. Not connected to live SIDH.",
      },
      {
        status: 202,
        headers: {
          "x-mock-notice": "MOCK CONTRACT - Skill India Digital Hub Simulated Endpoint",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
