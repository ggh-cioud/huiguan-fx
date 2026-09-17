import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "汇观 FX · 全球汇率看板",
  description: "查看全球小时参考汇率、每日历史走势与货币换算，收藏关注币种并设置本机到价提醒。",
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
