import { NextResponse } from "next/server";
import { createAltchaChallenge } from "@/lib/altcha";

export async function GET() {
  const challenge = await createAltchaChallenge();
  return NextResponse.json(challenge);
}
