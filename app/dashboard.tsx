"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowDownUp, ArrowUpRight, Globe2, RefreshCw, Search, Star, Bell, Clock3, ChevronRight, Info, Check, ChartNoAxesCombined } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Toaster, toast } from "sonner";
import { CurrencySelect, Coin, Sparkline, RateChart, Converter, Notice, PeriodSelect } from "./fx-components";
import RateAlerts from "./rate-alerts";
import { readLocal, writeLocal, requestJson, useSnapshot, useHistory, usePair, useAlerts } from "./use-market";
import { COMMON, currencyName, formatRate, percent, isOlderQuote, formatQuoteTime, HOUR_MS, convertAmount, type PairRate, type RateAlert } from "@/lib/fx";

type ModelTool = { name:string; description:string; title:string; inputSchema:object; annotations:{readOnlyHint:boolean;untrustedContentHint:boolean}; execute:(input:unknown)=>unknown|Promise<unknown> };
type ModelContext = { registerTool:(tool:ModelTool,options:{signal:AbortSignal})=>void|Promise<void> };
const changeClass = (value:number|null)=>value===null||Math.abs(value)<.00001?"muted":value>0?"positive":"negative";

export default function Dashboard() {
  const [ready,setReady]=useState(false),[base,setBase]=useState("CNY"),[selected,setSelected]=useState("USD");
  const [favorites,setFavorites]=useState<string[]>(["USD","EUR","JPY","GBP"]),[tab,setTab]=useState("common"),[query,setQuery]=useState(""),[sort,setSort]=useState("default"),[limit,setLimit]=useState(12);
  const [auto,setAuto]=useState(true),[tick,setTick]=useState(0),[days,setDays]=useState(30),[alertsOpen,setAlertsOpen]=useState(false);
  const [from,setFrom]=useState("USD"),[to,setTo]=useState("CNY"),[amount,setAmount]=useState("1000");
  const historyRef=useRef<HTMLElement>(null);
  useEffect(()=>{
    const prefs=readLocal<Record<string,unknown>>("huiguan.preferences",{});
    if(prefs && typeof prefs==="object") {
      if(typeof prefs.base==="string" && /^[A-Z]{3}$/.test(prefs.base)){setBase(prefs.base);setTo(prefs.base);setSelected(prefs.base==="USD"?"EUR":"USD");}
      if(Array.isArray(prefs.favorites))setFavorites(prefs.favorites.filter((v):v is string=>typeof v==="string"&&/^[A-Z]{3}$/.test(v)).slice(0,200));
      if(typeof prefs.auto==="boolean")setAuto(prefs.auto);
    }
    setReady(true);
  },[]);
  useEffect(()=>{if(ready)writeLocal("huiguan.preferences",{base,favorites,auto});},[ready,base,favorites,auto]);

  const market=useSnapshot(base,tick,ready),history=useHistory(selected,base,days,tick),conversion=usePair(from,to,tick),alertState=useAlerts(tick,ready);
  const data=market.data,currencies=data?.currencies || [];
  const hourly=data?.frequency==="hourly", comparisonLabel=hourly?"较前日末（UTC）":"较上次发布";
  const nextUpdateAt=data?.nextUpdateAt;
  useEffect(()=>{
    if(!auto || !ready)return;
    const refresh=()=>{if(document.visibilityState==="visible")setTick(n=>n+1);};
    const due=Date.parse(nextUpdateAt || "");
    const delay=Number.isFinite(due)&&due>Date.now()?due-Date.now()+1000:market.error?300000:HOUR_MS;
    const timer=setTimeout(refresh,delay);
    document.addEventListener("visibilitychange",refresh);window.addEventListener("online",refresh);
    return ()=>{clearTimeout(timer);document.removeEventListener("visibilitychange",refresh);window.removeEventListener("online",refresh);};
  },[auto,ready,nextUpdateAt,tick,market.error]);
  const quotes=useMemo(()=>[...(data?.quotes || [])].sort((a,b)=>(COMMON.indexOf(a.code)<0?999:COMMON.indexOf(a.code))-(COMMON.indexOf(b.code)<0?999:COMMON.indexOf(b.code))||a.code.localeCompare(b.code)),[data]);
  const current=quotes.find(q=>q.code===selected);
  const filtered=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    const rows=quotes.filter(q=>(tab==="all"||tab==="common"&&COMMON.includes(q.code)||tab==="favorites"&&favorites.includes(q.code)) && `${q.code} ${q.name} ${q.englishName}`.toLowerCase().includes(needle));
    if(sort==="rate-desc")rows.sort((a,b)=>b.rate-a.rate);
    if(sort==="rate-asc")rows.sort((a,b)=>a.rate-b.rate);
    if(sort==="change")rows.sort((a,b)=>(b.change??-Infinity)-(a.change??-Infinity));
    return rows;
  },[quotes,tab,favorites,query,sort]);
  const primaryCodes=COMMON.filter(code=>code!==base).slice(0,4);
  const activeCount=alertState.alerts.filter(a=>!a.triggeredAt).length;
  const latestDate=quotes.reduce((d,q)=>q.date>d?q.date:d,"");
  const toggleFavorite=(code:string)=>setFavorites(values=>values.includes(code)?values.filter(v=>v!==code):[...values,code]);
  const setGlobalBase=(value:string)=>{setBase(value);if(selected===value)setSelected(value==="USD"?"EUR":"USD");setLimit(12);};
  const selectChart=(code:string,scroll=false)=>{setSelected(code);if(scroll)historyRef.current?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});};
  const refresh=()=>setTick(n=>n+1);
  const addAlert=(alert:RateAlert)=>{alertState.setAlerts(old=>[alert,...old]);toast.success("提醒已保存到本机",{description:"满足条件时会在页面中提示，触发一次后停止。"});};
  const toolState=useRef({data,from,to,amount,setPair:conversion.setPair});toolState.current={data,from,to,amount,setPair:conversion.setPair};

  useEffect(()=>{
    const context=(document as Document & {modelContext?:ModelContext}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    const register=(tool:ModelTool)=>{try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
    register({name:"read_exchange_rates",title:"读取当前汇率",description:"读取看板当前基准货币的参考汇率、实际更新频率、报价时间和来源。数据可能过期，不是银行成交价。",inputSchema:{type:"object",properties:{codes:{type:"array",items:{type:"string"},maxItems:20}},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){const args=input as {codes?:unknown};if(!args||typeof args!=="object"||Array.isArray(args)||Object.keys(args).some(k=>k!=="codes")||args.codes!==undefined&&(!Array.isArray(args.codes)||args.codes.length>20||!args.codes.every(c=>typeof c==="string"&&/^[A-Z]{3}$/.test(c))))throw new Error("codes 必须为至多 20 个货币代码。");const snapshot=toolState.current.data;if(!snapshot)throw new Error("当前没有可用报价。");const codes=args.codes as string[]|undefined;return{base:snapshot.base,frequency:snapshot.frequency,source:snapshot.source,fetchedAt:snapshot.fetchedAt,nextUpdateAt:snapshot.nextUpdateAt,quotes:snapshot.quotes.filter(q=>!codes||codes.includes(q.code)).map(({code,rate,date})=>({code,rate,date,older:isOlderQuote(date)}))};}});
    register({name:"convert_currency",title:"换算货币",description:"设置页面换算器的金额与货币对，使用当前可用的参考汇率计算并更新页面，返回实际频率和报价时间。",inputSchema:{type:"object",properties:{from:{type:"string",pattern:"^[A-Z]{3}$"},to:{type:"string",pattern:"^[A-Z]{3}$"},amount:{type:"number",minimum:0}},required:["from","to","amount"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){const args=input as {from:string;to:string;amount:number};if(!args||typeof args!=="object"||Array.isArray(args)||Object.keys(args).some(k=>!["from","to","amount"].includes(k))||typeof args.from!=="string"||typeof args.to!=="string"||!/^[A-Z]{3}$/.test(args.from)||!/^[A-Z]{3}$/.test(args.to)||typeof args.amount!=="number"||!Number.isFinite(args.amount)||args.amount<0)throw new Error("请提供有效的货币代码和非负金额。");const pair=await requestJson<PairRate>(`/api/quote?from=${args.from}&to=${args.to}`,lifecycle.signal);const result=convertAmount(args.amount,pair.rate);if(result===null)throw new Error("换算金额超出可处理范围。");flushSync(()=>{setFrom(args.from);setTo(args.to);setAmount(String(args.amount));toolState.current.setPair(pair);});return{...pair,amount:args.amount,result,frequency:pair.frequency};}});
    return ()=>lifecycle.abort();
  },[]);

  return <div className="app-shell"><Toaster theme="dark" richColors position="top-right" closeButton/>
    <a className="skip-link" href="#main">跳转到汇率看板</a>
    <header className="topbar"><a href="/" className="brand" aria-label="汇观 FX 首页"><span className="brand-icon"><ArrowDownUp size={22}/></span><strong>汇观<span>FX</span></strong></a><span className="topbar-title">全球汇率观察</span><span className="reference-badge">{hourly?"小时参考汇率":data?"每日参考汇率":"小时级待连接"}</span><button className="icon-button header-bell" aria-label={`打开汇率提醒，${activeCount} 条待触发`} onClick={()=>setAlertsOpen(true)}><Bell size={20}/>{activeCount>0&&<span className="notification-count">{activeCount}</span>}</button></header>
    <main className="workspace" id="main"><div className="heading-row"><div><div className="eyebrow">CURRENCY OVERVIEW</div><h1>汇率，一目了然<span>.</span></h1><p>用熟悉的货币，观察世界的变化。</p></div><div className="heading-actions"><button className="button secondary" onClick={()=>setAlertsOpen(true)}><Bell size={16}/>设置提醒</button><button className="button primary refresh-button" disabled={market.loading} onClick={refresh} aria-label="刷新汇率数据"><RefreshCw className={market.loading?"spin":""} size={16}/>{market.loading?"正在更新":"刷新数据"}</button></div></div>
    <div className="market-toolbar"><span><Globe2 size={16}/>{data?`${quotes.length} 种货币`:"全球货币"}<i/><span className="toolbar-date">{latestDate?`最近报价 ${formatQuoteTime(latestDate)}${hourly?"（北京时间）":""}`:"获取最新可用报价"}</span></span><div className="base-control"><span>基准货币</span><CurrencySelect value={base} onChange={setGlobalBase} currencies={currencies} label="基准货币"/></div></div>
    {data?.setupRequired&&<div className="connection-banner" role="status"><Info size={16}/><span>小时级待启用：完成免费数据源配置并重启网站后，点击重新连接。当前仍显示每日参考数据。</span><button onClick={refresh}>重新连接</button></div>}
    {market.error&&<div className="connection-banner" role="alert"><Info size={16}/><span>{market.error}{data?" 当前显示上次保存的报价，请核对时间。":""}</span><button onClick={refresh}>重新连接</button></div>}
    <section className="quote-grid" aria-label="主要汇率">{primaryCodes.map(code=>{const quote=quotes.find(q=>q.code===code);return <button className={`quote-card ${selected===code?"selected-card":""}`} key={code} onClick={()=>selectChart(code)} aria-label={`查看 ${code} 兑 ${base} 历史走势`} aria-pressed={selected===code}><div className="quote-card-label"><Coin code={code}/><div><strong>{code} / {base}</strong><span>{currencyName(code)}</span></div><ArrowUpRight size={16}/></div><div className="quote-value">{quote?formatRate(quote.rate):"—"}</div><div className="quote-card-bottom"><div className={changeClass(quote?.change??null)}>{quote?percent(quote.change):"等待报价"}<span className="quote-caption">{comparisonLabel}</span></div>{quote&&<Sparkline points={quote.points} positive={(quote.change??0)>=0}/>}</div><span className="card-date">{quote?`${formatQuoteTime(quote.date)}${isOlderQuote(quote.date)?" · 报价过期":""}`:"等待参考报价"}</span></button>;})}</section>
    <div className="analysis-grid"><section className="panel history-panel" ref={historyRef} id="history"><div className="panel-heading history-heading"><div><h2><ChartNoAxesCombined size={18}/>历史日线</h2><p>1 {selected} 可兑换的 {base} 数量 · Frankfurter</p></div><CurrencySelect value={selected} onChange={setSelected} currencies={currencies} exclude={[base]} label="走势货币"/></div><div className="history-summary"><div><span className="quote-caption">当前{hourly?"小时":"每日"}报价 </span><strong className="history-price mono">{current?formatRate(current.rate):"—"}<small>{base}</small></strong><span className={changeClass(current?.change??null)}>{current?percent(current.change):"等待报价"}<span className="quote-caption">{comparisonLabel}</span></span></div><PeriodSelect days={days} onChange={setDays}/></div><RateChart points={history.data?.points||[]} quote={selected} base={base} loading={history.loading} error={history.error} retry={refresh}/><div className="chart-footnote"><Clock3 size={13}/><span>{history.data?.points.length?`${history.data.points[0].date} — ${history.data.points.at(-1)!.date} · 每日参考数据` : "历史记录按报价日展示"}</span><span>日线与当前小时报价来源不同，数值可能存在差异</span></div></section>
    <aside className="utility-column"><Converter from={from} to={to} amount={amount} pair={conversion.pair} error={conversion.error} currencies={currencies} setFrom={setFrom} setTo={setTo} setAmount={setAmount} swap={()=>{setFrom(to);setTo(from);}}/><button className="alert-shortcut" onClick={()=>setAlertsOpen(true)}><span className="alert-shortcut-icon"><Bell size={19}/></span><span><strong>不错过目标汇率</strong><small>{activeCount?`${activeCount} 条提醒等待触发`:"设置本机到价提醒"}</small></span><ChevronRight size={17}/></button></aside></div>
    <section className="panel rates-panel" id="rates"><Tabs value={tab} onValueChange={v=>{setTab(v);setLimit(12);}}><div className="panel-heading rates-heading"><TabsList className="market-tabs" variant="line" aria-label="汇率列表范围"><TabsTrigger value="common">常用货币</TabsTrigger><TabsTrigger value="all">全部货币 <span>{quotes.length||"—"}</span></TabsTrigger><TabsTrigger value="favorites"><Star size={14}/>我的自选 <span>{favorites.filter(c=>c!==base).length}</span></TabsTrigger></TabsList><div className="table-controls"><div className="search-box"><Search size={16}/><Input aria-label="搜索货币" placeholder="搜索货币名称或代码" value={query} onChange={e=>{setQuery(e.target.value);setLimit(12);}}/></div><Select value={sort} onValueChange={setSort}><SelectTrigger aria-label="汇率排序" className="sort-select"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="default">默认排序</SelectItem><SelectItem value="rate-desc">汇率从高到低</SelectItem><SelectItem value="rate-asc">汇率从低到高</SelectItem><SelectItem value="change">涨幅从高到低</SelectItem></SelectContent></Select></div></div><TabsContent value={tab} className="rates-content">
    {!data?(market.loading?<Notice loading title="正在连接汇率数据源" detail="获取最新可用的参考报价"/>:<Notice title="暂时无法获取报价" detail={market.error || "请检查网络连接，稍后重试。"} retry={refresh}/>):!filtered.length?<div className="empty-state"><Search size={24}/><h3>{query?"没有找到匹配的货币":tab==="favorites"?"还没有自选货币":"暂无可用报价"}</h3><p>{tab==="favorites"?"点击货币旁的星标，把关注的汇率放在一起。":tab==="common"?"试试切换到全部货币，或搜索 USD、日元等关键词。":"换个名称或货币代码试试。"}</p>{(query||tab!=="all")&&<button className="button secondary" onClick={()=>{setQuery("");setTab("all");}}>查看全部货币</button>}</div>:<><Table><TableHeader><TableRow><TableHead className="currency-col">货币</TableHead><TableHead className="numeric">汇率 / {base}</TableHead><TableHead className="numeric">{comparisonLabel}</TableHead><TableHead className="numeric desktop-col">近 7 日日线</TableHead><TableHead className="numeric desktop-col">报价时间（北京）</TableHead><TableHead className="numeric desktop-col"><span className="sr-only">查看走势</span></TableHead></TableRow></TableHeader><TableBody>{filtered.slice(0,limit).map(q=><TableRow key={q.code} className={selected===q.code?"selected-row":""}><TableCell><div className="currency-cell"><button className={`icon-button star-button ${favorites.includes(q.code)?"starred":""}`} onClick={()=>toggleFavorite(q.code)} aria-label={`${favorites.includes(q.code)?"取消":"添加"}${q.name}自选`} aria-pressed={favorites.includes(q.code)}><Star size={16} fill={favorites.includes(q.code)?"currentColor":"none"}/></button><Coin code={q.code} small/><button className="currency-name" onClick={()=>selectChart(q.code,true)}><strong>{q.code}</strong><span>{q.name}</span></button></div></TableCell><TableCell className="numeric mono">{formatRate(q.rate)}<span className="mobile-date">{formatQuoteTime(q.date)}{isOlderQuote(q.date)&&" · 较早"}</span></TableCell><TableCell className={`numeric ${changeClass(q.change)}`}>{percent(q.change)}<span className="comparison-date">{q.previousDate?`对比 ${formatQuoteTime(q.previousDate)}`:"缺少历史报价"}</span></TableCell><TableCell className="numeric desktop-col"><Sparkline points={q.points} positive={(q.change??0)>=0}/></TableCell><TableCell className="numeric muted desktop-col">{formatQuoteTime(q.date)}{isOlderQuote(q.date)&&<span className="older-badge">报价过期</span>}</TableCell><TableCell className="numeric desktop-col"><button className="icon-button" aria-label={`查看 ${q.code}/${base} 走势`} onClick={()=>selectChart(q.code,true)}><ChevronRight size={16}/></button></TableCell></TableRow>)}</TableBody></Table><div className="table-bottom"><span>显示 {Math.min(limit,filtered.length)} / {filtered.length} 种货币 · 1 单位外币兑换 {base}</span>{limit<filtered.length&&<button className="text-button" onClick={()=>setLimit(v=>v+20)}>显示更多 <ChevronRight size={14}/></button>}<span className="local-saved"><Check size={13}/>自选保存在本机</span></div></>}
    </TabsContent></Tabs></section>
    <div className="data-status"><div><Clock3 size={14}/><span>{data?`${market.cached?"本机保存":"最近获取"} ${new Date(data.fetchedAt).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false})}`:"等待连接"}</span>{hourly&&auto&&nextUpdateAt&&<span>下次检查 {formatQuoteTime(nextUpdateAt)}（北京）</span>}{data&&!data.historyAvailable&&<span className="warning-text">部分历史对比暂不可用</span>}</div><label className="auto-refresh"><Switch checked={auto} onCheckedChange={setAuto} aria-label="每小时自动更新"/><span>{auto?"每小时自动更新":"自动更新已暂停"}</span></label></div>
    <footer><span>汇观 FX<span className="footer-divider">/</span>看见货币的每一次变化</span><span>当前报价 <a href={hourly?"https://openexchangerates.org/":"https://frankfurter.dev/"} target="_blank" rel="noreferrer">{hourly?"Open Exchange Rates":"Frankfurter"} ↗</a> · 参考价，非银行成交价</span></footer>
    <details className="data-disclosure"><summary><Info size={13}/>数据说明</summary><p>{hourly?"当前报价来自 Open Exchange Rates 免费小时级数据，页面运行且联网时每小时更新。报价时间以北京时间显示，采用数据源的真实发布时间。涨跌幅对比同一来源的前一个 UTC 日末报价；缺少对比时显示“暂无对比”。报价超过 2 小时未更新、时间无效或明显超前时，暂停触发提醒。":"当前仍使用 Frankfurter 每日参考数据，小时级尚未启用。每日报价超过 4 天时暂停触发提醒。"} 历史曲线与近 7 日日线均来自 Frankfurter 每日参考数据，与小时报价口径可能不同。手动刷新、基准切换、换算和提醒共用服务端小时缓存。参考价不包含银行点差和手续费；关闭页面后不检查提醒。自选、缓存与提醒保存在当前浏览器。</p></details>
    </main><RateAlerts key={alertsOpen?`${selected}-${base}-open`:"closed"} open={alertsOpen} setOpen={setAlertsOpen} initialFrom={selected} initialTo={base} currencies={currencies} alerts={alertState.alerts} add={addAlert} remove={id=>alertState.setAlerts(old=>old.filter(a=>a.id!==id))} status={alertState.status}/>
  </div>;
}
