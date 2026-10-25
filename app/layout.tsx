import type { Metadata } from "next";
import "./globals.css";
import "./market-tools.css";

export const metadata: Metadata = {
  title: "汇观 FX · 全球汇率看板",
  description: "中英文汇率看板：小时参考报价、历史日线、货币换算、自选与本机到价提醒。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
