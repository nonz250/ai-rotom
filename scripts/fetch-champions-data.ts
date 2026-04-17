/**
 * 外部の攻略データ mod の TypeScript ソースを取得し、/tmp/champions-raw/ に保存するスクリプト。
 *
 * 使い方: npx tsx scripts/fetch-champions-data.ts
 *
 * 取得したファイルは {@link ./generate-champions-data.ts} から
 * desc/accuracy/pp/learnset などの補完データとして読み込まれる。
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const RAW_BASE =
  "https://raw.githubusercontent.com/smogon/pokemon-showdown/master";
const CHAMPIONS_MOD_URL = `${RAW_BASE}/data/mods/champions`;
const BASE_TEXT_URL = `${RAW_BASE}/data/text`;
const OUTPUT_DIR = "/tmp/champions-raw";
const CHAMPIONS_FILES = [
  "abilities.ts",
  "items.ts",
  "moves.ts",
  "learnsets.ts",
] as const;
const BASE_TEXT_FILES = [
  "abilities.ts",
  "items.ts",
  "moves.ts",
] as const;

const HTTP_OK_STATUS = 200;

async function fetchTextFile(url: string): Promise<string> {
  const response = await fetch(url);
  if (response.status !== HTTP_OK_STATUS) {
    throw new Error(
      `Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`
    );
  }
  return response.text();
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Fetching mod files...`);
  console.log(`Output dir: ${OUTPUT_DIR}`);

  for (const fileName of CHAMPIONS_FILES) {
    const content = await fetchTextFile(`${CHAMPIONS_MOD_URL}/${fileName}`);
    const outputPath = resolve(OUTPUT_DIR, fileName);
    writeFileSync(outputPath, content);
    console.log(`  Saved: ${outputPath} (${content.length} bytes)`);
  }

  console.log("\nFetching base text files for desc/shortDesc...");
  for (const fileName of BASE_TEXT_FILES) {
    const content = await fetchTextFile(`${BASE_TEXT_URL}/${fileName}`);
    const outputPath = resolve(OUTPUT_DIR, `base-text-${fileName}`);
    writeFileSync(outputPath, content);
    console.log(`  Saved: ${outputPath} (${content.length} bytes)`);
  }

  console.log("\nAll done!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
