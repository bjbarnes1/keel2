import { NextResponse } from "next/server";

import { parseBillDescription } from "@/lib/ai/parse-bill";

export async function POST(request: Request) {
  try {
    const { description } = (await request.json()) as { description?: string };
    const parsed = await parseBillDescription(description ?? "");

    return NextResponse.json({ success: true, data: parsed });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to parse bill.";

    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
