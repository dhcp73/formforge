import { sessionRoute } from "@/lib/app-route";
import { fileResponse } from "@/lib/files";
export const runtime = "nodejs";
export const GET = sessionRoute<{ id: string; index: string }>((s, p) => fileResponse(s.workspace.id, p.id, p.index));
