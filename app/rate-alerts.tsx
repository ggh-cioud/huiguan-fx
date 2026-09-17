"use client";
import { useState } from "react";
import { Bell, Plus, Trash2, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CurrencySelect } from "./fx-components";
import { formatRate, isOlderQuote, formatQuoteTime, type Currency, type RateAlert } from "@/lib/fx";

export default function RateAlerts({open,setOpen,initialFrom,initialTo,currencies,alerts,add,remove,status}:{open:boolean;setOpen:(v:boolean)=>void;initialFrom:string;initialTo:string;currencies:Currency[];alerts:RateAlert[];add:(v:RateAlert)=>void;remove:(id:string)=>void;status:string}) {
  const [from,setFrom]=useState(initialFrom),[to,setTo]=useState(initialTo),[direction,setDirection]=useState<"above"|"below">("above"),[target,setTarget]=useState(""),[error,setError]=useState("");
  const submit=(event:React.FormEvent)=>{
    event.preventDefault();const value=Number(target);
    if(from===to){setError("请选择两种不同的货币。");return;}
    if(!target.trim() || !Number.isFinite(value) || value<=0){setError("请输入大于 0 的目标汇率。");return;}
    if(alerts.length>=20){setError("最多保存 20 条提醒，请先移除不需要的提醒。");return;}
    if(alerts.some(a=>!a.triggeredAt && a.from===from && a.to===to && a.direction===direction && a.target===value)){setError("已经有一条相同的提醒。");return;}
    add({id:crypto.randomUUID(),from,to,direction,target:value,createdAt:new Date().toISOString(),triggeredAt:null});setTarget("");setError("");
  };
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent className="alerts-dialog" showCloseButton={false}><DialogClose className="dialog-close" aria-label="关闭汇率提醒"><X size={18}/></DialogClose><DialogHeader><DialogTitle className="dialog-title"><Bell size={20}/>汇率提醒</DialogTitle><DialogDescription>保存在本机，页面运行且联网时检查。小时级启用后每小时更新，无法捕捉两次更新之间的短暂波动。</DialogDescription></DialogHeader><form onSubmit={submit} className="alert-form"><div className="alert-pair"><div><span className="field-label">1 单位货币</span><CurrencySelect value={from} onChange={setFrom} currencies={currencies} label="提醒源货币"/></div><div><span className="field-label">兑换为</span><CurrencySelect value={to} onChange={setTo} currencies={currencies} label="提醒目标货币"/></div></div><div className="alert-target"><Select value={direction} onValueChange={v=>setDirection(v as "above"|"below")}><SelectTrigger aria-label="提醒条件"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="above">达到或高于</SelectItem><SelectItem value="below">达到或低于</SelectItem></SelectContent></Select><Input type="number" aria-label="目标汇率" placeholder="输入目标汇率" min="0" step="any" value={target} onChange={e=>setTarget(e.target.value)} required/></div>{error && <p className="negative form-error" role="alert">{error}</p>}<button className="button primary" type="submit"><Plus size={16}/>添加提醒</button></form><div className="alerts-list-heading"><h3>我的提醒 <span>{alerts.length}</span></h3><span>触发一次后停止</span></div>{!alerts.length?<div className="alerts-empty"><Bell size={24}/><p>还没有设置提醒</p><span>添加一个你关注的目标汇率</span></div>:<div className="alerts-list">{alerts.map(a=><article className={`alert-item ${a.triggeredAt?"triggered":""}`} key={a.id}><div className="alert-icon">{a.triggeredAt?<Check size={16}/>:<Bell size={16}/>}</div><div><strong>{a.from} / {a.to}</strong><p>{a.direction==="above"?"≥":"≤"} {formatRate(a.target)} <span>{a.triggeredAt?"已触发":"等待触发"}</span></p>{a.lastDate && <small>{formatQuoteTime(a.lastDate)} · {formatRate(a.lastRate!)}{isOlderQuote(a.lastDate)?" · 报价过期，暂停触发":""}</small>}</div><button className="icon-button" aria-label={`删除 ${a.from}/${a.to} 目标 ${a.target} 的提醒`} onClick={()=>remove(a.id)}><Trash2 size={16}/></button></article>)}</div>}<p className="alert-status" role="status">{status || "提醒与自选仅保存在当前浏览器"}</p></DialogContent></Dialog>;
}
