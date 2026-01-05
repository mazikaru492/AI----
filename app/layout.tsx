import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "数学類題ジェネレーター",
  description: "問題用紙を撮影してAIが数値を変えた類題を作成します",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
