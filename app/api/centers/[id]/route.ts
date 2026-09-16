import { getAppUser } from "@/lib/app-auth";
import { centerInputSchema } from "@/lib/center-schemas";
import { centerError, getCenterEnv } from "@/lib/centers";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return reply({ error: "forbidden_origin" }, 403);
  const user = await getAppUser(); if (!user || user.role !== "manager") return reply({ error: "sign_in_required" }, 401);
  const env = getCenterEnv(); if (!env.DB) return reply({ error: "directory_not_configured" }, 503);
  const id = (await params).id; const parsed = centerInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "invalid_center" }, 400);
  const c = parsed.data;
  try {
    const result = await env.DB.prepare("UPDATE centers SET name = ?, city = ?, address = ?, phone = ?, emergency_phone = ?, latitude = ?, longitude = ?, pci_available = ?, accepting_patients = ?, availability_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND manager_user_id = ?")
      .bind(c.name, c.city, c.address, c.phone, c.emergencyPhone, c.latitude || null, c.longitude || null, c.pciAvailable ? 1 : 0, c.availabilityStatus === "accepting" ? 1 : 0, c.availabilityStatus, id, user.id).run();
    if (!result.meta.changes) return reply({ error: "center_not_found_or_not_manager" }, 404);
    return reply({ ok: true, id });
  } catch (error) { return reply({ error: centerError(error) }, 503); }
}
