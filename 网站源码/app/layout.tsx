import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";
import "./reports.css";
import "./report-center.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://dayun-project-platform.coconut45666.chatgpt.site"),
  title: "大运G0104工程协同管理平台",
  description: "大运G0104工程协同管理平台统一提供项目全景、数据监测、全流程数值模拟、项目资料与报告管理。使用展示账户或管理账户登录。",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
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
