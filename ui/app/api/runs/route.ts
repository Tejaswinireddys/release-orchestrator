import { NextRequest, NextResponse } from "next/server";
import { startRun, listRuns, type RunMode } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ runs: listRuns() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const mode = (body.mode as RunMode) ?? "mock";
  const releaseVersion = (body.releaseVersion as string) ?? "1.0.0";
  const run = startRun({ mode, releaseVersion });
  return NextResponse.json({ run }, { status: 202 });
}
