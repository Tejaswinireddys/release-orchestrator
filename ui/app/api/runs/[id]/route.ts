import { NextRequest, NextResponse } from "next/server";
import { getRun } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const run = getRun(params.id);
  if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });
  return NextResponse.json({ run });
}
