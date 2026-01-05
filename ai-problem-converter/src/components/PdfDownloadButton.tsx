"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";
import type { GenerateResult } from "@/lib/types";
import { ProblemPdfDocument } from "@/components/ProblemPdf";

export function PdfDownloadButton({
  result,
  createdAt,
}: {
  result: GenerateResult;
  createdAt: string;
}) {
  return (
    <PDFDownloadLink
      document={<ProblemPdfDocument data={result} createdAt={createdAt} />}
      fileName="ai-problem.pdf"
    >
      {({ loading }) => (
        <button
          type="button"
          className="h-12 w-full rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "PDF生成中…" : "PDFをダウンロード"}
        </button>
      )}
    </PDFDownloadLink>
  );
}
