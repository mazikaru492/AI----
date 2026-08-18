"use client";

import { Document, Page, StyleSheet, Text, View, Image as PdfImage } from "@react-pdf/renderer";
import type { MathSolutionDetail } from "@/lib/mathTransformEngine";

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 44,
    fontSize: 10.5,
    lineHeight: 1.5,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: "#1a1a1a",
    paddingBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111111",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 9,
    color: "#555555",
  },
  section: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 8,
    color: "#222222",
  },
  box: {
    borderWidth: 1,
    borderColor: "#cccccc",
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#fafafa",
  },
  stepBox: {
    borderWidth: 1,
    borderColor: "#0070f3",
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#f4f8ff",
  },
  problemNumber: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
    color: "#0070f3",
  },
  formulaText: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
    color: "#111111",
  },
  answerText: {
    fontSize: 12,
    fontWeight: 700,
    color: "#008844",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: "#dddddd",
  },
  stepLine: {
    fontSize: 9.5,
    color: "#333333",
    marginBottom: 4,
  },
  problemImage: {
    maxHeight: 280,
    objectFit: "contain",
    marginVertical: 10,
    borderRadius: 4,
  },
  footer: {
    position: "absolute",
    left: 44,
    right: 44,
    bottom: 20,
    fontSize: 8.5,
    color: "#888888",
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#eeeeee",
    paddingTop: 6,
  },
});

export interface MathPdfData {
  imageUrl?: string;
  solution?: MathSolutionDetail;
  createdAt: string;
}

export function MathProblemPdfDocument({
  imageUrl,
  solution,
  createdAt,
}: MathPdfData) {
  return (
    <Document>
      {/* 1ページ目: 生徒用プリント */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>数学 類題プリント（問題）</Text>
          <Text style={styles.subtitle}>作成日時: {createdAt} | AI問題変換システム</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>問題</Text>
          {imageUrl && <PdfImage src={imageUrl} style={styles.problemImage} />}
          {solution?.transformedFormula && (
            <View style={styles.box}>
              <Text style={styles.problemNumber}>【類題】 {solution.problemType}</Text>
              <Text style={styles.formulaText}>{solution.transformedFormula}</Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <Text>AI問題変換 — 生徒用問題用紙</Text>
          <Text>1 / 2</Text>
        </View>
      </Page>

      {/* 2ページ目: 先生・自習用 模範解答＆ステップ解説 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>数学 類題プリント（模範解答・解説）</Text>
          <Text style={styles.subtitle}>作成日時: {createdAt} | 指導用・自己採点用</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>模範解答</Text>
          {solution ? (
            <View style={styles.stepBox}>
              <Text style={styles.problemNumber}>【問題種別】 {solution.problemType}</Text>
              <Text style={styles.formulaText}>{solution.transformedFormula}</Text>
              <Text style={styles.answerText}>正答: {solution.answer}</Text>
            </View>
          ) : (
            <View style={styles.box}>
              <Text>解答を計算中...</Text>
            </View>
          )}

          {solution?.steps && solution.steps.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.sectionTitle}>ステップバイステップ途中式・解説</Text>
              <View style={styles.box}>
                {solution.steps.map((step, idx) => (
                  <Text key={idx} style={styles.stepLine}>
                    {idx + 1}. {step}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <Text>AI問題変換 — 模範解答＆解説</Text>
          <Text>2 / 2</Text>
        </View>
      </Page>
    </Document>
  );
}

/** 後方互換性用エクスポート */
export function ProblemPdfDocument({
  data,
  createdAt,
}: {
  data: Array<{ id: number; question: string; answer: string }>;
  createdAt: string;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>数学 類題プリント（問題）</Text>
          <Text style={styles.subtitle}>作成日時: {createdAt}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>問題</Text>
          {data.map((item, idx) => (
            <View key={item.id || idx} style={styles.box}>
              <Text style={styles.problemNumber}>({idx + 1})</Text>
              <Text style={styles.formulaText}>{item.question}</Text>
            </View>
          ))}
        </View>
      </Page>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>数学 類題プリント（解答）</Text>
          <Text style={styles.subtitle}>作成日時: {createdAt}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>解答</Text>
          {data.map((item, idx) => (
            <View key={item.id || idx} style={styles.stepBox}>
              <Text style={styles.problemNumber}>({idx + 1})</Text>
              <Text style={styles.answerText}>{item.answer}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}


