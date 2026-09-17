import { getHistory, apiError } from "@/lib/fx-server";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try { return Response.json(await getHistory(params.get("from") || "USD", params.get("to") || "CNY", Number(params.get("days") || 30)), { headers: { "Cache-Control": "public, max-age=60, s-maxage=300", "X-Data-Frequency": "daily" } }); }
  catch (error) { return apiError(error); }
}
