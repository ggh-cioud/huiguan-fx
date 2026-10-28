"use client";
import { ArrowDownUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CurrencySelect } from "./fx-components";
import { CopyText } from "./copy-text";
import { useLanguage } from "./language-provider";
import { estimateConversion, decimalInput, formatAmount, type ConversionInputs } from "@/lib/conversion";
import { formatRate, isOlderQuote, type Currency, type PairRate } from "@/lib/fx";

type Props = {
  from: string; to: string; input: ConversionInputs; pair: PairRate | null; error: string; currencies: Currency[];
  setFrom: (value: string) => void; setTo: (value: string) => void; update: (value: Partial<ConversionInputs>) => void;
  swap: () => void; share: () => string | null; now?: number;
};

export default function Converter({ from, to, input, pair, error, currencies, setFrom, setTo, update, swap, share, now }: Props) {
  const { t, quoteTime, errorText } = useLanguage();
  const reverse = input.mode === "receive", amountValue = decimalInput(input.amount);
  const estimate = pair ? estimateConversion(input, pair.rate) : null;
  const stale = !!pair && isOlderQuote(pair.date, now);
  const output = estimate ? reverse ? estimate.paid : estimate.received : null;
  const outputCode = reverse ? from : to;
  const feesValid = [input.feePercent, input.fixedFee, input.spreadPercent].every(v => decimalInput(v) !== null)
    && Number(input.feePercent) < 100 && Number(input.spreadPercent) < 100;
  const message = amountValue === null ? t("请输入有效的非负金额") : !feesValid ? t("费用须为非负数，手续费率与点差须小于 100%。")
    : pair && !estimate ? t("支付金额不足以扣除费用，或计算超出范围。") : "";
  function copyResult() {
    if (!estimate || !pair) return null;
    return `${t("估算支付")} ${formatAmount(estimate.paid)} ${from} → ${t("估算到账")} ${formatAmount(estimate.received)} ${to}\n${t("估算手续费")} ${formatAmount(estimate.fee)} ${from}; ${t("手续费率（%）")} ${input.feePercent}; ${t("固定费用（{code}）", { code: from })} ${input.fixedFee}; ${t("点差（%）")} ${input.spreadPercent}\n${t("参考汇率")} 1 ${from} = ${formatRate(pair.rate)} ${to}; ${t("扣点差后的汇率")} ${formatRate(estimate.effectiveRate)}\n${quoteTime(pair.date)}${pair.frequency === "hourly" ? " UTC+8" : ""} · ${t(pair.frequency === "hourly" ? "小时报价" : "每日参考价")}${stale ? ` · ${t("报价过期")}` : ""}\n${t("自定义费用估算，非银行成交承诺。")}`;
  }
  return <section className="panel converter-panel" id="converter">
    <div className="panel-heading"><h2><ArrowDownUp size={18}/>{t("货币换算")}</h2></div>
    <div className="converter-body">
      <div className="conversion-modes" role="group" aria-label={t("换算方式")}>
        <button type="button" aria-pressed={!reverse} onClick={() => update({ mode: "send" })}>{t("我支付")}</button>
        <button type="button" aria-pressed={reverse} onClick={() => update({ mode: "receive" })}>{t("我希望到账")}</button>
      </div>
      <div className="converter-amount">
        <label className="field-label" htmlFor="convert-amount">{t(reverse ? "目标到账金额" : "支付金额")} · {reverse ? to : from}</label>
        <div className="amount-input"><Input id="convert-amount" type="number" inputMode="decimal" min="0" step="any" value={input.amount} onChange={event => update({ amount: event.target.value })} aria-describedby="conversion-help" aria-invalid={amountValue === null}/></div>
        <div className="amount-presets" aria-label={t("常用换算金额")}>{[100, 1000, 10000].map(value => <button type="button" key={value} onClick={() => update({ amount: String(value) })} aria-pressed={amountValue === value}>{value.toLocaleString("en-US")}</button>)}</div>
      </div>
      <div className="converter-from"><span className="field-label">{t("持有货币")}</span><CurrencySelect value={from} onChange={setFrom} currencies={currencies} label={t("持有货币")}/></div>
      <div className="swap-row"><span/><button className="icon-button swap-button" onClick={swap} aria-label={t("交换换算货币")}><ArrowDownUp size={18}/></button><span/></div>
      <div className="converter-to"><span className="field-label">{t("兑换为")}</span><CurrencySelect value={to} onChange={setTo} currencies={currencies} label={t("目标货币")}/></div>
      <details className="conversion-costs">
        <summary>{t("手续费与点差")}<span>{Number(input.feePercent) || Number(input.fixedFee) || Number(input.spreadPercent) ? t("已计入自定义费用") : t("当前为零费用")}</span></summary>
        <div className="cost-inputs">
          <label>{t("手续费率（%）")}<Input type="number" inputMode="decimal" min="0" max="99.999999" step="any" value={input.feePercent} onChange={event => update({ feePercent: event.target.value })}/></label>
          <label>{t("固定费用（{code}）", { code: from })}<Input type="number" inputMode="decimal" min="0" step="any" value={input.fixedFee} onChange={event => update({ fixedFee: event.target.value })}/></label>
          <label>{t("点差（%）")}<Input type="number" inputMode="decimal" min="0" max="99.999999" step="any" value={input.spreadPercent} onChange={event => update({ spreadPercent: event.target.value })}/></label>
        </div>
        <p>{t("先从支付金额扣除百分比手续费及固定费用，再按扣除点差后的汇率换算。固定费用使用支付币种。")}</p>
      </details>
      <div className={`conversion-result${stale ? " stale-result" : ""}`} role="status" aria-live="polite">
        <span>{t(reverse ? "估算需支付" : "估算到账")}{stale && ` · ${t("按过期报价计算")}`}</span>
        <strong data-testid="conversion-output">{output === null ? "—" : formatAmount(output)}<small>{outputCode}</small></strong>
        <p id="conversion-help">{message || errorText(error) || (pair ? `1 ${from} = ${formatRate(pair.rate)} ${to}` : t("正在获取换算汇率…"))}</p>
        {estimate && <dl className="conversion-breakdown"><div><dt>{t("估算手续费")}</dt><dd>{formatAmount(estimate.fee)} {from}</dd></div><div><dt>{t("扣点差后的汇率")}</dt><dd>{formatRate(estimate.effectiveRate)}</dd></div></dl>}
      </div>
      <div className="conversion-actions"><CopyText text={copyResult} label={t("复制结果")} disabled={!estimate}/><CopyText text={share} label={t("分享查询")} hint={t("链接包含金额和费用设置；打开时重新获取报价。")}/></div>
      <div className="conversion-note">{pair ? `${quoteTime(pair.date)}${pair.frequency === "hourly" ? ` UTC+8 · ${t("小时报价")}` : ` · ${t("每日参考价")}`}` : t("等待可用报价")}<br/>{t("自定义费用估算，非银行成交承诺。")}</div>
    </div>
  </section>;
}
