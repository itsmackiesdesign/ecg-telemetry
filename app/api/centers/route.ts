import { getChatGPTUser } from "@/app/chatgpt-auth";
import { centerInputSchema } from "@/lib/center-schemas";
import { centerError, getCenterEnv } from "@/lib/centers";
export const dynamic = "force-dynamic";

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const env = getCenterEnv();
  if (!env.DB) return reply({ error: "directory_not_configured" }, 503);
  const mine = new URL(request.url).searchParams.get("mine") === "1";
  const user = mine ? await getChatGPTUser() : null;
  if (mine && !user) return reply({ error: "sign_in_required" }, 401);
  try {
    const query = mine
      ? "SELECT id, name, city, address, phone, emergency_phone, latitude, longitude, pci_available, accepting_patients, manager_email, created_at, updated_at FROM centers WHERE manager_user_id = ? ORDER BY name"
      : "SELECT id, name, city, address, phone, emergency_phone, latitude, longitude, pci_available, accepting_patients, created_at, updated_at FROM centers ORDER BY accepting_patients DESC, pci_available DESC, name";
    const result = mine
      ? await env.DB.prepare(query).bind(user!.userId).all()
      : await env.DB.prepare(query).all();
    return reply({ centers: result.results });
  } catch (error) {
    return reply({ error: centerError(error) }, 503);
  }
}

export async function POST(request: Request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return reply({ error: "forbidden_origin" }, 403);
  const user = await getChatGPTUser();
  if (!user) return reply({ error: "sign_in_required" }, 401);
  const env = getCenterEnv();
  if (!env.DB) return reply({ error: "directory_not_configured" }, 503);
  const parsed = centerInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "invalid_center", details: parsed.error.flatten().fieldErrors }, 400);
  const center = parsed.data;
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare("INSERT INTO centers (id, name, city, address, phone, emergency_phone, latitude, longitude, pci_available, accepting_patients, manager_user_id, manager_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, center.name, center.city, center.address, center.phone, center.emergencyPhone, center.latitude || null, center.longitude || null, center.pciAvailable ? 1 : 0, center.acceptingPatients ? 1 : 0, user.userId, user.email).run();
    return reply({ id, center: { id, ...center, manager_email: user.email } }, 201);
  } catch (error) {
    return reply({ error: centerError(error) }, 503);
  }
}
