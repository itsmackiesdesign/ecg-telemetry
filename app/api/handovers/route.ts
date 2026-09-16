import { getChatGPTUser } from "@/app/chatgpt-auth";
import { handoverContextSchema } from "@/lib/center-schemas";
import { centerError, getCenterEnv } from "@/lib/centers";
import { imageMime, MAX_IMAGE_BYTES } from "@/lib/ecg/service";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export async function POST(request: Request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return reply({ error: "forbidden_origin" }, 403);
  const user = await getChatGPTUser(); if (!user) return reply({ error: "sign_in_required" }, 401);
  const env = getCenterEnv(); if (!env.DB || !env.ECG_BUCKET) return reply({ error: "transfer_not_configured" }, 503);
  if (!request.headers.get("Content-Type")?.startsWith("multipart/form-data")) return reply({ error: "invalid_input" }, 400);
  const length = Number(request.headers.get("Content-Length")); if (length > MAX_IMAGE_BYTES + 65536) return reply({ error: "file_too_large" }, 413);
  try {
    const form = await request.formData(); const file = form.get("image");
    if (!file || typeof file === "string" || !file.size || file.size > MAX_IMAGE_BYTES) return reply({ error: "invalid_image" }, 400);
    const context = handoverContextSchema.safeParse(JSON.parse(String(form.get("context"))));
    if (!context.success) return reply({ error: "invalid_input" }, 400);
    const center = await env.DB.prepare("SELECT id, name, accepting_patients FROM centers WHERE id = ?").bind(context.data.centerId).first<{ id: string; name: string; accepting_patients: number }>();
    if (!center) return reply({ error: "center_not_found" }, 404);
    if (!center.accepting_patients) return reply({ error: "center_not_accepting" }, 409);
    const bytes = new Uint8Array(await file.arrayBuffer()); const mime = imageMime(bytes);
    if (!mime || mime !== file.type) return reply({ error: "invalid_image" }, 400);
    const id = crypto.randomUUID(); const objectKey = `handovers/${context.data.centerId}/${id}.${mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"}`;
    await env.ECG_BUCKET.put(objectKey, bytes, { httpMetadata: { contentType: mime }, customMetadata: { handoverId: id, centerId: context.data.centerId } });
    try {
      await env.DB.prepare("INSERT INTO center_handovers (id, center_id, clinician_user_id, clinician_email, patient_json, ecg_object_key, ecg_content_type, ecg_bytes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')")
        .bind(id, context.data.centerId, user.userId, user.email, JSON.stringify({ ...context.data, patientId: context.data.patientId || null }), objectKey, mime, bytes.byteLength).run();
    } catch (error) { await env.ECG_BUCKET.delete(objectKey); throw error; }
    return reply({ ok: true, handoverId: id, center: { id: center.id, name: center.name }, status: "new", sentAt: new Date().toISOString() }, 201);
  } catch (error) { return reply({ error: centerError(error) }, 503); }
}
