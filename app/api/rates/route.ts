import { getSnapshot, apiError } from "@/lib/fx-server";
export async function GET(request: Request) {
  try { const data = await getSnapshot(new URL(request.url).searchParams.get("base") || "CNY"); return Response.json(data, { headers: { "Cache-Control": "no-store", "X-Data-Frequency": data.frequency } }); }
  catch (error) { return apiError(error); }
}
