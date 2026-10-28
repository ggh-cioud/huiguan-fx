"use client";
import { useState } from "react";
import { useLanguage } from "./language-provider";
import { localizedCurrencyName } from "@/lib/i18n";
import { RefreshCw, Activity, Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { COMMON, NAMES, currencyName, type Currency, type Point } from "@/lib/fx";

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
