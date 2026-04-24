import { NextRequest } from "next/server";
import { handleAuthCallback } from "@/lib/auth-callback";

export async function GET(request: NextRequest) {
  return handleAuthCallback(request);
}
