"use client";
import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "./language-provider";

export function CopyText({ text, label, hint, disabled = false }: { text: () => string | null; label: string; hint?: string; disabled?: boolean }) {
  const { t } = useLanguage();
  const [manual, setManual] = useState("");
  async function copy() {
    const value = text();
    if (!value) { toast.error(t("请先填写有效的查询参数。")); return; }
    try { await navigator.clipboard.writeText(value); setManual(""); toast.success(t("已复制")); }
    catch { setManual(value); }
  }
  return <div className="copy-control"><button type="button" className="button secondary" onClick={copy} disabled={disabled}><Copy size={15}/>{label}</button>{hint && <small className="copy-hint">{hint}</small>}{manual && <label className="manual-copy">{t("无法自动复制，请选择下面的文字复制。")}<textarea aria-label={label} readOnly value={manual} onFocus={event => event.currentTarget.select()}/></label>}</div>;
}
