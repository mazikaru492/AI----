"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileSpreadsheet, Loader2, Sparkles } from "lucide-react";
import { useAppShell } from "@/components/AppShell";

interface EnglishWordTestSystemProps {
  onBack: () => void;
}

function parseFilenameFromHeader(disposition: string | null): string {
  if (!disposition) return `word-test-${Date.now()}.xlsx`;
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) return decodeURIComponent(utf8);
  const plain = disposition.match(/filename="?([^"]+)"?/i)?.[1];
  return plain ?? `word-test-${Date.now()}.xlsx`;
}

export function EnglishWordTestSystem({ onBack }: EnglishWordTestSystemProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [range, setRange] = useState("A2:A50");
  const [sheetName, setSheetName] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const shell = useAppShell();
  const { incrementApiUsage, addHistoryEntry } = shell ?? {};

  const selectedFileLabel = useMemo(() => {
    if (!excelFile) return "Excelファイルを選択してください";
    return `選択中: ${excelFile.name}`;
  }, [excelFile]);

  const summaryItems = useMemo(
    () => [
      { label: "ファイル", value: excelFile?.name ?? "未選択" },
      { label: "範囲", value: range || "-" },
      { label: "シート", value: sheetName.trim() || "先頭シート" },
      { label: "出題数", value: `${questionCount}問` },
    ],
    [excelFile, range, sheetName, questionCount],
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!excelFile) {
      setError("Excelファイルを選択してください。");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setStatus("単語テストを生成しています...");

    try {
      const formData = new FormData();
      formData.append("excel", excelFile);
      formData.append("range", range);
      formData.append("questionCount", String(questionCount));
      if (sheetName.trim()) {
        formData.append("sheetName", sheetName.trim());
      }

      const response = await fetch("/api/english-word-test", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const contentType = response.headers.get("Content-Type") ?? "";
        if (contentType.includes("application/json")) {
          const errorBody = (await response.json()) as { error?: string };
          throw new Error(
            errorBody.error || `生成に失敗しました (${response.status})`,
          );
        }
        const plainText = (await response.text())
          .replace(/<[^>]*>/g, " ")
          .trim();
        throw new Error(plainText || `生成に失敗しました (${response.status})`);
      }

      const blob = await response.blob();
      const generatedCount = Number(
        response.headers.get("X-Question-Count") ?? questionCount,
      );
      const filename = parseFilenameFromHeader(
        response.headers.get("Content-Disposition"),
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      incrementApiUsage?.();
      addHistoryEntry?.({
        id: crypto.randomUUID(),
        createdAt: new Date().toLocaleString("ja-JP", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
        summary: `英語単語テストを生成 (${range})`,
        numbersDetected: Number.isFinite(generatedCount)
          ? generatedCount
          : questionCount,
      });

      setStatus("テストをExcel形式でダウンロードしました。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラーが発生しました。");
      setStatus("");
    } finally {
      setIsGenerating(false);
    }
  }, [
    excelFile,
    range,
    questionCount,
    sheetName,
    incrementApiUsage,
    addHistoryEntry,
  ]);

  return (
    <>
      <div className="liquid-page-bg" />
      <main className="mx-auto w-full max-w-xl md:max-w-6xl px-4 md:px-8 py-4 md:py-8">
        <div className="flex flex-col gap-4 md:gap-6">
          <button
            type="button"
            onClick={onBack}
            className="liquid-button inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm md:text-base font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            システム選択に戻る
          </button>

          <div className="grid gap-4 md:gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="flex flex-col gap-4 md:gap-6">
              <section className="liquid-panel rounded-[24px] md:rounded-[32px] p-4 md:p-5">
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-white drop-shadow-sm">
                  英語 単語穴埋めテスト
                </h1>
                <p className="mt-2 text-sm md:text-base text-white/80">
                  Excelの指定範囲から単語をランダム抽出し、例文と選択肢付きのテストを作成します。
                </p>
              </section>

              <section className="liquid-panel rounded-[24px] md:rounded-[32px] p-4 md:p-5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    setExcelFile(e.target.files?.[0] ?? null);
                    setError(null);
                  }}
                />

                <button
                  type="button"
                  onClick={openFilePicker}
                  className="liquid-button mb-3 md:mb-4 flex h-12 md:h-14 w-full items-center justify-center gap-2 rounded-2xl text-white/90 text-sm md:text-base"
                >
                  <FileSpreadsheet className="h-5 w-5" />
                  Excelファイルを選択
                </button>

                <p className="mb-4 text-sm md:text-base text-white/75">
                  {selectedFileLabel}
                </p>

                <div className="grid gap-4">
                  <label className="text-sm md:text-base font-semibold text-white/85">
                    単語範囲 (例: A2:A50)
                    <input
                      value={range}
                      onChange={(e) => setRange(e.target.value)}
                      className="liquid-input mt-1.5 h-11 md:h-12 w-full rounded-xl px-4 text-sm md:text-base"
                    />
                  </label>

                  <label className="text-sm md:text-base font-semibold text-white/85">
                    シート名 (任意)
                    <input
                      value={sheetName}
                      onChange={(e) => setSheetName(e.target.value)}
                      placeholder="空欄なら先頭シート"
                      className="liquid-input mt-1.5 h-11 md:h-12 w-full rounded-xl px-4 text-sm md:text-base"
                    />
                  </label>

                  <label className="text-sm md:text-base font-semibold text-white/85">
                    出題数
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={questionCount}
                      onChange={(e) =>
                        setQuestionCount(
                          Math.max(
                            1,
                            Math.min(50, Number(e.target.value) || 1),
                          ),
                        )
                      }
                      className="liquid-input mt-1.5 h-11 md:h-12 w-full rounded-xl px-4 text-sm md:text-base"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="liquid-button-primary mt-5 flex h-13 md:h-14 w-full items-center justify-center gap-2 rounded-full text-base md:text-lg font-semibold transition-colors disabled:opacity-70"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5" />
                      単語テストを生成してExcel出力
                    </>
                  )}
                </button>

                {status && !error && (
                  <p
                    className="liquid-panel-soft mt-4 rounded-xl px-3 py-2 text-sm font-medium text-white/90"
                    style={{ borderColor: "rgba(52,199,89,0.3)" }}
                  >
                    {status}
                  </p>
                )}
                {error && (
                  <p
                    className="liquid-panel-soft mt-4 rounded-xl px-3 py-2 text-sm font-medium text-red-200"
                    style={{ borderColor: "rgba(255,59,48,0.3)" }}
                  >
                    {error}
                  </p>
                )}
              </section>
            </div>

            <aside className="flex flex-col gap-4 md:gap-6">
              <section className="liquid-panel-soft rounded-[24px] md:rounded-[28px] p-4 md:p-5">
                <h2 className="text-sm md:text-base font-semibold text-white drop-shadow-sm">
                  設定プレビュー
                </h2>
                <div className="mt-3 space-y-2">
                  {summaryItems.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white/10 px-3 py-2 text-xs md:text-sm text-white/85"
                    >
                      <span className="text-white/60">{item.label}</span>
                      <span className="text-right font-semibold text-white">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="liquid-panel-soft rounded-[24px] md:rounded-[28px] p-4 md:p-5">
                <h2 className="text-sm md:text-base font-semibold text-white drop-shadow-sm">
                  生成のヒント
                </h2>
                <ul className="mt-3 space-y-2 text-xs md:text-sm text-white/80">
                  <li className="flex gap-2">
                    <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold text-white">
                      1
                    </span>
                    <span>単語列だけを含む範囲を指定</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold text-white">
                      2
                    </span>
                    <span>シート名がある場合は正確に入力</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold text-white">
                      3
                    </span>
                    <span>出題数は範囲内の単語数以内に</span>
                  </li>
                </ul>
              </section>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
