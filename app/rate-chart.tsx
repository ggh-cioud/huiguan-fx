"use client";
import { TrendingUp } from "lucide-react";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { formatRate, type Point } from "@/lib/fx";
import { Notice } from "./fx-components";
import { useLanguage } from "./language-provider";

export default function RateChart({ points, quote, base, loading, error, retry }: { points: Point[]; quote: string; base: string; loading: boolean; error: string; retry: () => void }) {
  const { t, errorText } = useLanguage();
  if (loading) return <Notice loading title={t("正在获取历史走势")} detail={`${quote} / ${base} · ${t("每日参考报价")}`}/>;
  if (error) return <Notice title={t("历史走势暂不可用")} detail={errorText(error)} retry={retry}/>;
  if (points.length < 2) return <Notice title={t("历史记录不足")} detail={t("该时段没有足够的报价，试试更长的时间范围。")}/>;
  const plotted = points.map(p => ({ ...p, time: Date.parse(`${p.date}T00:00:00Z`) }));
  const min = Math.min(...points.map(p=>p.rate)), max = Math.max(...points.map(p=>p.rate)), padding = (max-min)*.15 || max*.002;
  return <><ChartContainer config={{ rate: { label: `${quote} / ${base}`, color: "#c4f76a" } }} className="history-chart" aria-label={t("{from} 兑换 {to} 的历史汇率，{start} 至 {end}",{from:quote,to:base,start:points[0].date,end:points.at(-1)!.date})}><AreaChart data={plotted} margin={{ top:12, right:8, left:0, bottom:0 }} accessibilityLayer><defs><linearGradient id="rate-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c4f76a" stopOpacity={.2}/><stop offset="100%" stopColor="#c4f76a" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#243240" strokeDasharray="3 5"/><XAxis dataKey="time" type="number" domain={["dataMin","dataMax"]} tickFormatter={v=>new Date(Number(v)).toISOString().slice(5,10)} tickLine={false} axisLine={false} minTickGap={40} tickMargin={12} fontSize={12}/><YAxis orientation="right" domain={[Math.max(0,min-padding),max+padding]} tickLine={false} axisLine={false} tickFormatter={v=>Number(v).toLocaleString("en-US",{maximumFractionDigits: v<.1?5:3})} width={64} tickMargin={8} tickCount={5} fontSize={12}/><ChartTooltip content={({active,payload})=>{ if(!active || !payload?.length) return null; const p=payload[0].payload as Point; return <div className="chart-tooltip"><span>{p.date}</span><strong>{formatRate(p.rate)} {base}</strong><small>{t("1 {code} 的参考价格",{code:quote})}</small></div>; }}/><Area type="linear" dataKey="rate" stroke="#c4f76a" strokeWidth={2} fill="url(#rate-fill)" isAnimationActive={false} activeDot={{ r:4, stroke:"#111923", strokeWidth:2 }}/></AreaChart></ChartContainer><div className="chart-summary"><span><TrendingUp size={14}/>{t("区间最低")}<b>{formatRate(min)}</b></span><span>{t("区间最高")}<b>{formatRate(max)}</b></span><span>{t("{count} 个报价日",{count:points.length})}</span></div><details className="chart-data"><summary>{t("查看历史数据")}</summary><div className="history-data-scroll"><table><caption className="sr-only">{t("每日历史参考汇率")}</caption><thead><tr><th>{t("报价日期")}</th><th>1 {quote} = {base}</th></tr></thead><tbody>{[...points].reverse().map(p=><tr key={p.date}><td>{p.date}</td><td>{formatRate(p.rate)}</td></tr>)}</tbody></table></div></details></>;
}
