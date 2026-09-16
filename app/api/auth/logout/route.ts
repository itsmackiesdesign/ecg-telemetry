import { clearSession } from "@/lib/app-auth";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { await clearSession(new URL(request.url).protocol === "https:"); return Response.json({ ok: true }); }
