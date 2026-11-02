import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const urn = url.searchParams.get("urn") || "urn:uuid:mock";

  return NextResponse.json(
    {
      verified: true,
      status: "VALID",
      digiLockerUri: `in.gov.msde.satyarpl:${urn.replace("urn:uuid:", "")}`,
      qualification: {
        title: "Assistant Electrician",
        qpCode: "CON/Q0602",
        nsqfLevel: 3,
        nqrCode: "QG-03-CO-03951-2025-V2-CSDCI",
      },
      registry: "Mock DigiLocker National Academy Depository (NAD)",
      mockNotice: "MOCK CONTRACT - Simulated DigiLocker verification response.",
    },
    {
      headers: {
        "x-mock-notice": "MOCK CONTRACT - Simulated DigiLocker Endpoint",
      },
    }
  );
}
