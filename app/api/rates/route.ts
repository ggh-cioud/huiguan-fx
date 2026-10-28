import { getSnapshot, apiError, FxError } from "@/lib/fx-server";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const view = params.get("view") || "full";
    if (!["quotes", "full"].includes(view)) throw new FxError("请选择有效的报价视图。", 400);
    const data = await getSnapshot(params.get("base") || "CNY", view !== "quotes");
    return Response.json(data, { headers: { "Cache-Control": "no-store", "X-Data-Frequency": data.frequency } });
  }
  catch (error) { return apiError(error); }
}
