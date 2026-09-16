import { getAppUser } from "@/lib/app-auth";
export const dynamic = "force-dynamic";
export async function GET() { const user = await getAppUser(); return Response.json({ user }, { headers: { "Cache-Control": "no-store" } }); }
