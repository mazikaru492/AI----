"use client";

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { GenerateResult } from "@/lib/types";

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontSize: 11,
    lineHeight: 1.4,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 10,
    color: "#444",
  },
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 8,
  },
  box: {
    borderWidth: 1,
    borderColor: "#bbb",
    padding: 10,
    marginBottom: 12,
  },
  problemNumber: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
  },
  line: {
    marginBottom: 4,
  },
  footer: {
    position: "absolute",
    left: 48,
    right: 48,
    bottom: 24,
    fontSize: 9,
    color: "#666",
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function MultilineText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  return (
    <View>
      {lines.map((line, idx) => (
        <Text key={idx} style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
  );
}

export function ProblemPdfDocument({
  data,
  createdAt,
}: {
  data: GenerateResult;
  createdAt: string;
}) {
  return (
    <Document>
      {/* 1ページ目: 生徒用問題 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>数学 類題プリント（生徒用）</Text>
          <Text style={styles.subtitle}>作成日時: {createdAt}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>問題</Text>
          {data.map((problem, idx) => (
            <View key={problem.id} style={styles.box}>
              <Text style={styles.problemNumber}>({idx + 1})</Text>
              <MultilineText text={problem.question} />
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text>AI問題変換</Text>
          <Text>1 / 2</Text>
        </View>
      </Page>

      {/* 2ページ目: 先生用解答 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>数学 類題プリント（先生用）</Text>
          <Text style={styles.subtitle}>作成日時: {createdAt}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>模範解答</Text>
          {data.map((problem, idx) => (
            <View key={problem.id} style={styles.box}>
              <Text style={styles.problemNumber}>({idx + 1})</Text>
              <MultilineText text={problem.answer} />
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text>AI問題変換</Text>
          <Text>2 / 2</Text>
        </View>
      </Page>
    </Document>
  );
}
