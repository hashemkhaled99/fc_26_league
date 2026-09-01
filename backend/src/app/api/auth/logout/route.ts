import { getSession } from "@/lib/session";
import { apiSuccess } from "@/lib/api";

export async function POST() {
  const session = await getSession();
  session.destroy();
  return apiSuccess({ ok: true });
}
