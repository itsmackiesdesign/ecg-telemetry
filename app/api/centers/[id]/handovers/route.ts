import { getChatGPTUser } from "@/app/chatgpt-auth";
import { centerError, getCenterEnv } from "@/lib/centers";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser(); if (!user) return reply({ error: "sign_in_required" }, 401);
  const env = getCenterEnv(); if (!env.DB) return reply({ error: "directory_not_configured" }, 503);
  try {
    const id = (await params).id;
    const allowed = await env.DB.prepare("SELECT id FROM centers WHERE id = ? AND manager_user_id = ?").bind(id, user.userId).first();
    if (!allowed) return reply({ error: "center_not_found_or_not_manager" }, 404);
    const rows = await env.DB.prepare("SELECT id, clinician_email, patient_json, ecg_content_type, ecg_bytes, status, created_at, acknowledged_at FROM center_handovers WHERE center_id = ? ORDER BY created_at DESC LIMIT 50").bind(id).all();
    return reply({ handovers: rows.results.map((row) => ({ ...row, patient: safeJson(row.patient_json) })) });
  } catch (error) { return reply({ error: centerError(error) }, 503); }
}
function safeJson(value: unknown) { try { return JSON.parse(String(value)); } catch { return null; } }
