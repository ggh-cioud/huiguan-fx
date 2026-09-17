import { getPair, apiError } from "@/lib/fx-server";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try { const data = await getPair(params.get("from") || "USD", params.get("to") || "CNY"); return Response.json(data, { headers: { "Cache-Control": "no-store", "X-Data-Frequency": data.frequency } }); }
  catch (error) { return apiError(error); }
}
