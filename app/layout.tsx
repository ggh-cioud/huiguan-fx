import type { Metadata } from "next";
import "./globals.css";
import "./market-tools.css";

export const metadata: Metadata = {
  title: "汇观 FX · 全球汇率看板",
  description: "中文开源汇率看板：查询小时参考汇率、历史日线与货币换算，搜索和收藏币种，导出带来源的 CSV，并设置本机到价提醒。",
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
