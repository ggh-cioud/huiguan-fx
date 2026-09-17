"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { alertMatches, formatRate, formatQuoteTime, type Snapshot, type HistoryData, type PairRate, type RateAlert } from "@/lib/fx";

export function readLocal<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}
let storageWarned = false;
export function writeLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { if (!storageWarned) { storageWarned = true; toast.warning("浏览器无法保存本机数据，关闭页面后设置可能丢失。"); } }
}
export async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(40000)]) : AbortSignal.timeout(40000) });
  const json = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(json?.error || "数据暂时不可用，请稍后重试。");
  return json as T;
}
export function useSnapshot(base: string, tick: number, ready: boolean) {
  const [data, setData] = useState<Snapshot | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [cached, setCached] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const saved = readLocal<Snapshot | null>(`huiguan.snapshot.v2.${base}`, null);
    if (saved && ["daily","hourly"].includes(saved.frequency) && saved.base === base && typeof saved.fetchedAt === "string" && Array.isArray(saved.quotes) && saved.quotes.every(q=>q && typeof q.code==="string" && typeof q.name==="string" && typeof q.englishName==="string" && typeof q.date==="string" && Number.isFinite(q.rate) && q.rate>0 && (q.change===null||Number.isFinite(q.change)) && Array.isArray(q.points) && q.points.every(p=>p && typeof p.date==="string" && Number.isFinite(p.rate) && p.rate>0)) && Array.isArray(saved.currencies) && saved.currencies.every(c=>c&&typeof c.code==="string"&&typeof c.name==="string")) { setData(saved); setCached(true); }
    setLoading(true); setError("");
    requestJson<Snapshot>(`/api/rates?base=${base}`, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setData(value); setCached(false); writeLocal(`huiguan.snapshot.v2.${base}`, value);
    }).catch(error => { if (!controller.signal.aborted) { setError(error instanceof Error ? error.message : "连接暂时中断，请核对报价时间。"); setCached(true); } }).finally(()=>{ if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [base,tick,ready]);
  return { data: data?.base === base ? data : null, loading, error, cached };
}
export function useHistory(from: string, to: string, days: number, tick: number) {
  const [data,setData]=useState<HistoryData | null>(null), [loading,setLoading]=useState(true), [error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController(); setData(null); setLoading(true); setError("");
    requestJson<HistoryData>(`/api/history?from=${from}&to=${to}&days=${days}`,controller.signal).then(v=>{ if(!controller.signal.aborted)setData(v); }).catch(error=>{ if(!controller.signal.aborted)setError(error instanceof Error ? error.message : "暂时无法连接历史数据源，请稍后重试。"); }).finally(()=>{ if(!controller.signal.aborted)setLoading(false); });
    return ()=>controller.abort();
  },[from,to,days,tick]);
  return { data: data?.from===from && data.to===to && data.days===days ? data : null, loading, error };
}
export function usePair(from: string, to: string, tick: number) {
  const [pair,setPair]=useState<PairRate | null>(null),[error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();setPair(current=>current?.from===from&&current.to===to?current:null);setError("");
    requestJson<PairRate>(`/api/quote?from=${from}&to=${to}`,controller.signal).then(v=>{ if(!controller.signal.aborted)setPair(v); }).catch(error=>{ if(!controller.signal.aborted)setError(error instanceof Error ? error.message : "暂无可用换算报价，请刷新重试。"); });
    return ()=>controller.abort();
  },[from,to,tick]);
  return { pair: pair?.from===from && pair.to===to ? pair : null, error, setPair };
}
export function validAlert(value: unknown): value is RateAlert {
  if (!value || typeof value!=="object") return false;
  const a=value as RateAlert;
  return typeof a.id==="string" && /^[A-Z]{3}$/.test(a.from) && /^[A-Z]{3}$/.test(a.to) && a.from!==a.to && ["above","below"].includes(a.direction) && Number.isFinite(a.target) && a.target>0 && typeof a.createdAt==="string" && (a.triggeredAt===null || typeof a.triggeredAt==="string");
}
export function useAlerts(tick: number, ready: boolean) {
  const [alerts,setAlerts]=useState<RateAlert[]>([]),[loaded,setLoaded]=useState(false),[status,setStatus]=useState("");
  const alertsRef=useRef(alerts); alertsRef.current=alerts;
  useEffect(()=>{ const saved=readLocal<unknown>("huiguan.alerts",[]);setAlerts(Array.isArray(saved)?saved.filter(validAlert).slice(0,20):[]);setLoaded(true); },[]);
  useEffect(()=>{ if(loaded)writeLocal("huiguan.alerts",alerts); },[alerts,loaded]);
  const activeKey=alerts.filter(a=>!a.triggeredAt).map(a=>`${a.id}:${a.from}:${a.to}:${a.direction}:${a.target}`).join("|");
  useEffect(()=>{
    if(!ready || !loaded || !activeKey) { setStatus("");return; }
    const controller=new AbortController(), active=alertsRef.current.filter(a=>!a.triggeredAt);
    const pairs=[...new Set(active.map(a=>`${a.from}/${a.to}`))];
    setStatus("正在检查提醒…");
    Promise.allSettled(pairs.map(async pair=>{
      const [from,to]=pair.split("/");
      return requestJson<PairRate>(`/api/quote?from=${from}&to=${to}`,controller.signal);
    })).then(results=>{
      if(controller.signal.aborted)return;
      const quotes=results.flatMap(r=>r.status==="fulfilled"?[r.value]:[]), triggered:RateAlert[]=[];
      const updated=alertsRef.current.map(alert=>{
        if(alert.triggeredAt)return alert;
        const quote=quotes.find(q=>q.from===alert.from && q.to===alert.to);
        if(!quote)return alert;
        const next={...alert,lastRate:quote.rate,lastDate:quote.date};
        if(alertMatches(alert,quote)){next.triggeredAt=new Date().toISOString();triggered.push(next);}
        return next;
      });
      setAlerts(updated);
      triggered.forEach(a=>toast.success(`${a.from}/${a.to} 已${a.direction==="above"?"达到":"降至"}目标`,{description:`当前参考价 ${formatRate(a.lastRate!)} · 报价时间 ${formatQuoteTime(a.lastDate!)}`,duration:12000}));
      setStatus(results.some(r=>r.status==="rejected")?"部分提醒未能完成检查，稍后自动重试。":"已检查 · 仅对有效且未过期的报价触发");
    });
    return ()=>controller.abort();
  },[activeKey,tick,ready,loaded]);
  return { alerts,setAlerts,status };
}
