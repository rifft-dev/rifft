import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const clickhouseUrl = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
const clickhouseUser = process.env.CLICKHOUSE_USER ?? "default";
const clickhousePassword = process.env.CLICKHOUSE_PASSWORD ?? "";

const missingDatabaseUrlError = () => new Error("DATABASE_URL must be set");

export const pgPool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
    })
  : ({
      query: async () => {
        throw missingDatabaseUrlError();
      },
      end: async () => undefined,
    } as unknown as Pool);

type ClickHouseRow = Record<string, unknown>;

export const queryClickHouse = async <T extends ClickHouseRow>(query: string) => {
  const response = await fetch(clickhouseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "X-ClickHouse-User": clickhouseUser,
      "X-ClickHouse-Key": clickhousePassword,
    },
    body: `${query}\nFORMAT JSONEachRow`,
  });

  if (!response.ok) {
    throw new Error(`ClickHouse query failed: ${response.status} ${await response.text()}`);
  }

  const text = await response.text();
  if (!text.trim()) {
    return [] as T[];
  }

  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as T);
};

export const closePools = async () => {
  await pgPool.end();
};
