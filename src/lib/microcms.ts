import { createClient, type MicroCMSQueries } from "microcms-js-sdk";
import type { Introduction } from "@/types/introduction";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

let cachedClient: ReturnType<typeof createClient> | null = null;

export function getMicrocmsClient() {
  // 注意: Next.jsのbuild時点で環境変数が無いケースがあるため、初期化は遅延させる
  if (cachedClient) return cachedClient;
  cachedClient = createClient({
    serviceDomain: getRequiredEnv("MICROCMS_SERVICE_DOMAIN"),
    apiKey: getRequiredEnv("MICROCMS_API_KEY"),
  });
  return cachedClient;
}

export async function getIntroduction(queries?: MicroCMSQueries) {
  // ユーザー提供コードを基盤にした取得
  // エンドポイント名を 'name' に変更
  const client = getMicrocmsClient();
  return client.get<Introduction>({ endpoint: "name", queries });
}
