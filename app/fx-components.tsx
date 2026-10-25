"use client";
import { useState } from "react";
import { useLanguage } from "./language-provider";
import { localizedCurrencyName } from "@/lib/i18n";
import { ArrowDownUp, RefreshCw, TrendingUp, Activity, Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { COMMON, NAMES, formatRate, currencyName, convertAmount, isOlderQuote, type Currency, type Point, type PairRate } from "@/lib/fx";

export function CurrencySelect({ value, onChange, currencies, label, exclude = [] }: { value: string; onChange: (value: string) => void; currencies: Currency[]; label: string; exclude?: string[] }) {
  const { t, name } = useLanguage();
  const [open, setOpen] = useState(false);
  const options = currencies.length ? [...currencies].sort((a,b) => (COMMON.indexOf(a.code) < 0 ? 999 : COMMON.indexOf(a.code)) - (COMMON.indexOf(b.code) < 0 ? 999 : COMMON.indexOf(b.code)) || a.code.localeCompare(b.code)) : Object.keys(NAMES).map(code => ({ code, name: currencyName(code), englishName: localizedCurrencyName(code, "en") }));
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" aria-label={label} className="currency-select"><span>{value} · {name(value)}</span><ChevronsUpDown size={14} aria-hidden="true"/></button></PopoverTrigger>
    <PopoverContent className="currency-picker" align="end" aria-label={t("选择{label}",{label})}>
      <Command label={t("{label}选项",{label})} loop>
        <CommandInput placeholder={t("搜索代码、中文或英文名称")} aria-label={t("搜索{label}",{label})}/>
        <CommandList><CommandEmpty>{t("没有匹配的货币")}</CommandEmpty><CommandGroup>
          {options.filter(c => !exclude.includes(c.code)).map(c => <CommandItem key={c.code} value={c.code} keywords={[c.name, c.englishName, name(c.code)]} onSelect={() => { onChange(c.code); setOpen(false); }}>
            <span className="picker-code">{c.code}</span><span>{name(c.code,c)}</span>{value === c.code && <Check className="picker-check" aria-hidden="true"/>}
          </CommandItem>)}
        </CommandGroup></CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
export function PeriodSelect({days,onChange}:{days:number;onChange:(value:number)=>void}) {const { t } = useLanguage(); return <RadioGroup value={String(days)} onValueChange={v=>onChange(Number(v))} aria-label={t("历史时间范围")} className="period-radio">{[[7,t("7天")],[30,t("30天")],[90,t("90天")],[365,t("1年")]].map(([value,label])=><label key={value} className={days===value?"active-period":""}><RadioGroupItem value={String(value)} className="sr-only"/>{label}</label>)}</RadioGroup>;}
export function Coin({ code, small = false }: { code: string; small?: boolean }) { const symbols: Record<string,string> = { USD:"$", EUR:"€", JPY:"¥", CNY:"¥", GBP:"£", KRW:"₩", CHF:"₣", INR:"₹", THB:"฿" }; return <span aria-hidden="true" className={`coin coin-${code}${small ? " small-coin" : ""}`}>{symbols[code] ?? code.slice(0,2)}</span>; }
export function Sparkline({ points }: { points: Point[] }) {
  const { t } = useLanguage();
  if (points.length < 2) return <span className="muted">—</span>;
  const values = points.map(p => p.rate), min = Math.min(...values), range = Math.max(...values) - min || Math.max(min * .005, .000001);
  const coords = values.map((v,i) => `${3 + i/(values.length-1)*94},${31 - (v-min)/range*25}`).join(" ");
  return <svg className="sparkline" viewBox="0 0 100 38" aria-label={t("{start} 至 {end} 的每日参考汇率走势（Frankfurter）",{start:points[0].date,end:points.at(-1)!.date})} role="img"><polyline points={coords} fill="none" stroke={points.at(-1)!.rate >= points[0].rate ? "#b5eb70" : "#f58e9a"} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/></svg>;
}
export function Notice({ title, detail, loading = false, retry }: { title: string; detail: string; loading?: boolean; retry?: () => void }) { const { t } = useLanguage(); return <div className="empty-state" role={loading ? "status" : "alert"}>{loading ? <RefreshCw className="spin"/> : <Activity/>}<h3>{title}</h3><p>{detail}</p>{retry && <button className="button secondary" onClick={retry}>{t("重试")}</button>}</div>; }
export function RateChart({ points, quote, base, loading, error, retry }: { points: Point[]; quote: string; base: string; loading: boolean; error: string; retry: () => void }) {
  const { t, errorText } = useLanguage();
  if (loading) return <Notice loading title={t("正在获取历史走势")} detail={`${quote} / ${base} · ${t("每日参考报价")}`}/>;
  if (error) return <Notice title={t("历史走势暂不可用")} detail={errorText(error)} retry={retry}/>;
  if (points.length < 2) return <Notice title={t("历史记录不足")} detail={t("该时段没有足够的报价，试试更长的时间范围。")}/>;
  const plotted = points.map(p => ({ ...p, time: Date.parse(`${p.date}T00:00:00Z`) }));
  const min = Math.min(...points.map(p=>p.rate)), max = Math.max(...points.map(p=>p.rate)), padding = (max-min)*.15 || max*.002;
  return <><ChartContainer config={{ rate: { label: `${quote} / ${base}`, color: "#c4f76a" } }} className="history-chart" aria-label={t("{from} 兑换 {to} 的历史汇率，{start} 至 {end}",{from:quote,to:base,start:points[0].date,end:points.at(-1)!.date})}><AreaChart data={plotted} margin={{ top:12, right:8, left:0, bottom:0 }} accessibilityLayer><defs><linearGradient id="rate-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c4f76a" stopOpacity={.2}/><stop offset="100%" stopColor="#c4f76a" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#243240" strokeDasharray="3 5"/><XAxis dataKey="time" type="number" domain={["dataMin","dataMax"]} tickFormatter={v=>new Date(Number(v)).toISOString().slice(5,10)} tickLine={false} axisLine={false} minTickGap={40} tickMargin={12} fontSize={12}/><YAxis orientation="right" domain={[Math.max(0,min-padding),max+padding]} tickLine={false} axisLine={false} tickFormatter={v=>Number(v).toLocaleString("en-US",{maximumFractionDigits: v<.1?5:3})} width={64} tickMargin={8} tickCount={5} fontSize={12}/><ChartTooltip content={({active,payload})=>{ if(!active || !payload?.length) return null; const p=payload[0].payload as Point; return <div className="chart-tooltip"><span>{p.date}</span><strong>{formatRate(p.rate)} {base}</strong><small>{t("1 {code} 的参考价格",{code:quote})}</small></div>; }}/><Area type="linear" dataKey="rate" stroke="#c4f76a" strokeWidth={2} fill="url(#rate-fill)" isAnimationActive={false} activeDot={{ r:4, stroke:"#111923", strokeWidth:2 }}/></AreaChart></ChartContainer><div className="chart-summary"><span><TrendingUp size={14}/>{t("区间最低")}<b>{formatRate(min)}</b></span><span>{t("区间最高")}<b>{formatRate(max)}</b></span><span>{t("{count} 个报价日",{count:points.length})}</span></div><details className="chart-data"><summary>{t("查看历史数据")}</summary><div className="history-data-scroll"><table><caption className="sr-only">{t("每日历史参考汇率")}</caption><thead><tr><th>{t("报价日期")}</th><th>1 {quote} = {base}</th></tr></thead><tbody>{[...points].reverse().map(p=><tr key={p.date}><td>{p.date}</td><td>{formatRate(p.rate)}</td></tr>)}</tbody></table></div></details></>;
}
export function Converter({ from, to, amount, pair, error, currencies, setFrom, setTo, setAmount, swap, now }: { from: string; to: string; amount: string; pair: PairRate | null; error: string; currencies: Currency[]; setFrom:(v:string)=>void; setTo:(v:string)=>void; setAmount:(v:string)=>void; swap:()=>void; now?:number }) {
  const { t, quoteTime, errorText } = useLanguage();
  const amountValue = amount.trim() === "" ? NaN : Number(amount), result = pair ? convertAmount(amountValue,pair.rate) : null;
  return <section className="panel converter-panel" id="converter">
    <div className="panel-heading"><h2><ArrowDownUp size={18}/>{t("货币换算")}</h2></div>
    <div className="converter-body">
      <div className="converter-amount"><label className="field-label" htmlFor="convert-amount">{t("持有金额")}</label><div className="amount-input"><Input id="convert-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={e=>setAmount(e.target.value)} aria-describedby="conversion-help" aria-invalid={!!amount && (!Number.isFinite(amountValue) || amountValue<0)}/></div><div className="amount-presets" aria-label={t("常用换算金额")}>{[100,1000,10000].map(v => <button type="button" key={v} onClick={()=>setAmount(String(v))} aria-pressed={amountValue===v}>{v.toLocaleString("en-US")}</button>)}</div></div>
      <div className="converter-from"><span className="field-label">{t("持有货币")}</span><CurrencySelect value={from} onChange={setFrom} currencies={currencies} label={t("持有货币")}/></div>
      <div className="swap-row"><span/><button className="icon-button swap-button" onClick={swap} aria-label={t("交换换算货币")}><ArrowDownUp size={18}/></button><span/></div>
      <div className="converter-to"><span className="field-label">{t("兑换为")}</span><CurrencySelect value={to} onChange={setTo} currencies={currencies} label={t("目标货币")}/></div>
      <div className={`conversion-result${pair&&isOlderQuote(pair.date,now)?" stale-result":""}`} role="status" aria-live="polite"><span>{pair&&isOlderQuote(pair.date,now)?t("按过期报价计算"):t("预计可兑换")}</span><strong>{result === null ? "—" : result.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits: result>0&&result<.01?8:2})}<small>{to}</small></strong><p id="conversion-help">{errorText(error) || (!amount.trim() ? t("请输入持有金额") : !Number.isFinite(amountValue)||amountValue<0 ? t("请输入有效的非负金额") : pair ? `1 ${from} = ${formatRate(pair.rate)} ${to}` : t("正在获取换算汇率…"))}</p></div>
      <div className="conversion-note">{pair ? `${quoteTime(pair.date)}${pair.frequency==="hourly"?`${t("（北京时间）")} · ${t("小时报价")}`:` · ${t("每日参考价")}`}${isOlderQuote(pair.date,now) ? ` · ${t("报价过期")}` : ""}` : t("等待可用报价")}<br/>{t("未计入兑换手续费与银行点差")}</div>
    </div>
  </section>;
}
