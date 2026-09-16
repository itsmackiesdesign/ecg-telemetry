import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getCenterEnv } from "@/lib/centers";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser(); if (!user) return new Response("Sign in required", { status: 401 });
  const env = getCenterEnv(); if (!env.DB || !env.ECG_BUCKET) return new Response("Storage unavailable", { status: 503 });
  const id = (await params).id;
  const row = await env.DB.prepare("SELECT h.ecg_object_key, h.ecg_content_type, c.manager_user_id FROM center_handovers h JOIN centers c ON c.id = h.center_id WHERE h.id = ? AND (h.clinician_user_id = ? OR c.manager_user_id = ?)").bind(id, user.userId, user.userId).first<{ ecg_object_key: string; ecg_content_type: string }>();
  if (!row) return new Response("Not found", { status: 404 });
  const object = await env.ECG_BUCKET.get(row.ecg_object_key); if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": row.ecg_content_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
