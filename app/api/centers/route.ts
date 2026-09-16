import { getAppUser } from "@/lib/app-auth";
import { centerInputSchema } from "@/lib/center-schemas";
import { centerError, getCenterEnv } from "@/lib/centers";
export const dynamic = "force-dynamic";

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const env = getCenterEnv();
  if (!env.DB) return reply({ error: "directory_not_configured" }, 503);
  const mine = new URL(request.url).searchParams.get("mine") === "1";
  const user = mine ? await getAppUser() : null;
  if (mine && !user) return reply({ error: "sign_in_required" }, 401);
  try {
    const query = mine
      ? "SELECT id, name, city, address, phone, emergency_phone, latitude, longitude, pci_available, accepting_patients, availability_status, manager_email, created_at, updated_at FROM centers WHERE manager_user_id = ? ORDER BY name"
      : "SELECT id, name, city, address, phone, emergency_phone, latitude, longitude, pci_available, accepting_patients, availability_status, created_at, updated_at FROM centers ORDER BY CASE availability_status WHEN 'accepting' THEN 0 WHEN 'limited' THEN 1 ELSE 2 END, pci_available DESC, name";
    const result = mine
      ? await env.DB.prepare(query).bind(user!.id).all()
      : await env.DB.prepare(query).all();
    return reply({ centers: result.results });
  } catch (error) {
    return reply({ error: centerError(error) }, 503);
  }
}

export async function POST(request: Request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return reply({ error: "forbidden_origin" }, 403);
  const user = await getAppUser();
  if (!user) return reply({ error: "sign_in_required" }, 401);
  const env = getCenterEnv();
  if (!env.DB) return reply({ error: "directory_not_configured" }, 503);
  const parsed = centerInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "invalid_center", details: parsed.error.flatten().fieldErrors }, 400);
  const center = parsed.data;
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare("INSERT INTO centers (id, name, city, address, phone, emergency_phone, latitude, longitude, pci_available, accepting_patients, availability_status, manager_user_id, manager_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, center.name, center.city, center.address, center.phone, center.emergencyPhone, center.latitude || null, center.longitude || null, center.pciAvailable ? 1 : 0, center.availabilityStatus === "accepting" ? 1 : 0, center.availabilityStatus, user.id, user.email).run();
    return reply({ id, center: { id, ...center, manager_email: user.email } }, 201);
  } catch (error) {
    return reply({ error: centerError(error) }, 503);
  }
}
