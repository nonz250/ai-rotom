import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CURRENT_PARTY_SCHEMA_VERSION } from "@ai-rotom/shared";
import type { PartiesFile } from "@ai-rotom/shared";
import { loadPartiesFile, savePartiesFile } from "./party-store.js";

const NOW = "2026-04-23T00:00:00.000Z";

function makeParty(name: string): PartiesFile["parties"][number] {
  return {
    name,
    members: [{ name: "Pikachu" }],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("party-store", () => {
  let workDir: string;
  let filePath: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "ai-rotom-party-"));
    filePath = join(workDir, "nested", "parties.json");
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  describe("loadPartiesFile", () => {
    it("ファイルが存在しない場合は空の PartiesFile を返す", () => {
      const file = loadPartiesFile(filePath);
      expect(file.schemaVersion).toBe(CURRENT_PARTY_SCHEMA_VERSION);
      expect(file.parties).toEqual([]);
    });

    it("保存済みファイルを読み込める (ラウンドトリップ)", () => {
      const data: PartiesFile = {
        schemaVersion: CURRENT_PARTY_SCHEMA_VERSION,
        parties: [makeParty("メインパ")],
      };
      savePartiesFile(data, filePath);

      const loaded = loadPartiesFile(filePath);
      expect(loaded).toEqual(data);
    });

    it("JSON パース失敗時に明示的なエラーを投げる", () => {
      const brokenPath = join(workDir, "broken.json");
      writeFileSync(brokenPath, "{not json", { encoding: "utf-8" });
      expect(() => loadPartiesFile(brokenPath)).toThrow(/JSON パース/);
    });

    it("schemaVersion が未対応ならエラーを投げる", () => {
      const UNKNOWN_VERSION = 99;
      const dir = join(workDir, "v99");
      mkdirSync(dir, { recursive: true });
      const target = join(dir, "parties.json");
      writeFileSync(
        target,
        JSON.stringify({ schemaVersion: UNKNOWN_VERSION, parties: [] }),
        { encoding: "utf-8" },
      );
      expect(() => loadPartiesFile(target)).toThrow(/schemaVersion/);
    });

    it("壊れたスキーマ (必須フィールド欠落) はエラーを投げる", () => {
      const dir = join(workDir, "broken");
      mkdirSync(dir, { recursive: true });
      const target = join(dir, "parties.json");
      writeFileSync(target, JSON.stringify({ schemaVersion: 1 }), {
        encoding: "utf-8",
      });
      expect(() => loadPartiesFile(target)).toThrow(/スキーマ検証/);
    });

    it("members 0 匹の不正データはエラーを投げる", () => {
      const dir = join(workDir, "zero-members");
      mkdirSync(dir, { recursive: true });
      const target = join(dir, "parties.json");
      writeFileSync(
        target,
        JSON.stringify({
          schemaVersion: CURRENT_PARTY_SCHEMA_VERSION,
          parties: [
            {
              name: "x",
              members: [],
              createdAt: NOW,
              updatedAt: NOW,
            },
          ],
        }),
        { encoding: "utf-8" },
      );
      expect(() => loadPartiesFile(target)).toThrow(/スキーマ検証/);
    });

    it("members 7 匹以上の不正データはエラーを投げる", () => {
      const dir = join(workDir, "seven-members");
      mkdirSync(dir, { recursive: true });
      const target = join(dir, "parties.json");
      const tooMany = Array.from({ length: 7 }, () => ({ name: "Pikachu" }));
      writeFileSync(
        target,
        JSON.stringify({
          schemaVersion: CURRENT_PARTY_SCHEMA_VERSION,
          parties: [
            {
              name: "x",
              members: tooMany,
              createdAt: NOW,
              updatedAt: NOW,
            },
          ],
        }),
        { encoding: "utf-8" },
      );
      expect(() => loadPartiesFile(target)).toThrow(/スキーマ検証/);
    });
  });

  describe("savePartiesFile", () => {
    it("ディレクトリが存在しなくても作成して保存する", () => {
      const data: PartiesFile = {
        schemaVersion: CURRENT_PARTY_SCHEMA_VERSION,
        parties: [makeParty("新規")],
      };
      savePartiesFile(data, filePath);
      const raw = readFileSync(filePath, { encoding: "utf-8" });
      expect(JSON.parse(raw)).toEqual(data);
    });

    it("書き込み後に一時ファイルが残らない (atomic rename)", () => {
      const data: PartiesFile = {
        schemaVersion: CURRENT_PARTY_SCHEMA_VERSION,
        parties: [makeParty("atomic-test")],
      };
      savePartiesFile(data, filePath);
      const dir = join(workDir, "nested");
      const entries = readdirSync(dir);
      expect(entries).toEqual(["parties.json"]);
    });

    it("schema 違反の data は保存前に弾かれる", () => {
      const invalid = {
        schemaVersion: CURRENT_PARTY_SCHEMA_VERSION,
        parties: [
          {
            name: "x",
            members: [], // 1 匹未満 (min violation)
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      } as unknown as PartiesFile;
      expect(() => savePartiesFile(invalid, filePath)).toThrow();
    });
  });
});
