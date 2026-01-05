"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { GeneratedProblem } from "@/lib/types";

// 日本語フォントの登録（Noto Sans JP）
Font.register({
  family: "NotoSansJP",
  fonts: [
    {
      src: "https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf",
      fontWeight: "normal",
    },
    {
      src: "https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFJEj75vPMn0.ttf",
      fontWeight: "bold",
    },
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontFamily: "NotoSansJP",
    fontSize: 12,
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 30,
    borderBottom: "2px solid #333",
    paddingBottom: 15,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 10,
    color: "#666",
    textAlign: "center",
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 10,
    backgroundColor: "#f0f0f0",
    padding: 8,
  },
  problemText: {
    fontSize: 12,
    lineHeight: 1.8,
    marginBottom: 10,
    whiteSpace: "pre-wrap",
  },
  answerBox: {
    marginTop: 40,
    border: "1px solid #333",
    padding: 15,
    minHeight: 100,
  },
  answerLabel: {
    fontSize: 10,
    color: "#666",
    marginBottom: 5,
  },
  stepItem: {
    fontSize: 11,
    marginBottom: 8,
    paddingLeft: 15,
    lineHeight: 1.6,
  },
  stepNumber: {
    fontWeight: "bold",
    color: "#333",
  },
  finalAnswer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: "#e8f5e9",
    border: "2px solid #4caf50",
  },
  finalAnswerLabel: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#2e7d32",
    marginBottom: 5,
  },
  finalAnswerText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    fontSize: 8,
    color: "#999",
    textAlign: "center",
  },
  pageNumber: {
    position: "absolute",
    bottom: 30,
    right: 50,
    fontSize: 10,
    color: "#666",
  },
  watermark: {
    position: "absolute",
    top: 30,
    right: 50,
    fontSize: 10,
    color: "#999",
  },
});

interface ProblemPDFProps {
  problem: GeneratedProblem;
}

export function ProblemPDF({ problem }: ProblemPDFProps) {
  const currentDate = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Document>
      {/* 1ページ目: 生徒用問題用紙 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.watermark}>
          <Text>生徒用</Text>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>練習問題</Text>
          <Text style={styles.subtitle}>作成日: {currentDate}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>【問題】</Text>
          <Text style={styles.problemText}>{problem.newProblem}</Text>
        </View>

        <View style={styles.answerBox}>
          <Text style={styles.answerLabel}>解答欄</Text>
        </View>

        <Text style={styles.footer}>
          このプリントはAIによって生成されました
        </Text>
        <Text style={styles.pageNumber}>1 / 2</Text>
      </Page>

      {/* 2ページ目: 先生用模範解答 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.watermark}>
          <Text>先生用（模範解答）</Text>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>模範解答</Text>
          <Text style={styles.subtitle}>作成日: {currentDate}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>【問題】</Text>
          <Text style={styles.problemText}>{problem.newProblem}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>【解説】</Text>
          <Text style={styles.problemText}>{problem.solution}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>【解答手順】</Text>
          {problem.steps.map((step, index) => (
            <View key={index} style={styles.stepItem}>
              <Text>
                <Text style={styles.stepNumber}>Step {index + 1}: </Text>
                {step}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.finalAnswer}>
          <Text style={styles.finalAnswerLabel}>【答え】</Text>
          <Text style={styles.finalAnswerText}>{problem.answer}</Text>
        </View>

        <Text style={styles.footer}>
          このプリントはAIによって生成されました
        </Text>
        <Text style={styles.pageNumber}>2 / 2</Text>
      </Page>
    </Document>
  );
}
