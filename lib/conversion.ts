export type ConversionMode = "send" | "receive";
export type ConversionInputs = { amount: string; mode: ConversionMode; feePercent: string; fixedFee: string; spreadPercent: string };
export type ConversionEstimate = { paid: number; received: number; fee: number; effectiveRate: number };

export function decimalInput(value: unknown): number | null {
  if (typeof value !== "string" || value.length > 32 || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

// Fees are deducted in the source currency; spread reduces the reference rate.
// Keep full precision here. Formatting belongs to the presentation layer.
export function estimateConversion(input: ConversionInputs, rate: number): ConversionEstimate | null {
  const amount = decimalInput(input.amount), feePercent = decimalInput(input.feePercent);
  const fixedFee = decimalInput(input.fixedFee), spread = decimalInput(input.spreadPercent);
  if (amount === null || feePercent === null || fixedFee === null || spread === null || feePercent >= 100 || spread >= 100 || !Number.isFinite(rate) || rate <= 0 || !["send", "receive"].includes(input.mode)) return null;
  const effectiveRate = rate * (1 - spread / 100);
  const paid = input.mode === "send" ? amount : (amount / effectiveRate + fixedFee) / (1 - feePercent / 100);
  const fee = paid * feePercent / 100 + fixedFee;
  if (paid < fee && input.mode === "send") return null;
  const received = input.mode === "receive" ? amount : (paid - fee) * effectiveRate;
  return [paid, received, fee, effectiveRate].every(Number.isFinite) && effectiveRate > 0 ? { paid, received, fee, effectiveRate } : null;
}

export function formatAmount(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: value > 0 && value < .01 ? 8 : 2 });
}
