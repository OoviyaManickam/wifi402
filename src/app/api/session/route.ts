import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  if (!ip) {
    return NextResponse.json({ session: null });
  }

  const session = await getActiveSession(ip);

  if (!session) {
    return NextResponse.json({ session: null });
  }

  return NextResponse.json({
    session: {
      id: session.id,
      planId: session.plan_id,
      expiresAt: session.expires_at,
      remainingMs: Math.max(0, session.expires_at - Date.now()),
    },
  });
}
