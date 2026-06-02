import { NextRequest, NextResponse } from "next/server";
import { demoPackages } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const version = req.nextUrl.searchParams.get("version") ?? "1.4.0";
  return NextResponse.json({ packages: demoPackages(version) });
}
