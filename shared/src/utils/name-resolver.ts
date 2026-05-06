export interface NameEntry {
  ja: string;
  en: string;
}

/**
 * 表記揺れを吸収するための正規化キー。
 * - 全角英数字 → 半角 (リザードナイトＸ → リザードナイトX)
 * - 全角空白 → 半角空白
 * - 空白を全削除 (「リザードナイト Ｘ」「リザードナイトX」を同一視)
 * - 大文字小文字統一 (X / x の差異を吸収)
 *
 * NameResolver の主要 API (toEnglish / toJapanese / hasJapaneseName /
 * hasEnglishName) は、まず原文 lookup を試みて失敗した場合のみ正規化キーで
 * 再 lookup する。原文 lookup が hit する既存挙動は変えない。
 */
function normalizeNameKey(name: string): string {
  return name
    .replace(/[！-～]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/　/g, " ")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export class NameResolver {
  private readonly jaToEn: Map<string, string>;
  private readonly enToJa: Map<string, string>;
  private readonly jaNames: string[];
  private readonly normalizedJaToEn: Map<string, string>;
  private readonly normalizedEnToJa: Map<string, string>;

  constructor(entries: NameEntry[]) {
    this.jaToEn = new Map(entries.map((e) => [e.ja, e.en]));
    this.enToJa = new Map(entries.map((e) => [e.en, e.ja]));
    this.jaNames = entries.map((e) => e.ja);
    this.normalizedJaToEn = new Map(
      entries.map((e) => [normalizeNameKey(e.ja), e.en]),
    );
    this.normalizedEnToJa = new Map(
      entries.map((e) => [normalizeNameKey(e.en), e.ja]),
    );
  }

  toEnglish(jaName: string): string | undefined {
    const direct = this.jaToEn.get(jaName);
    if (direct !== undefined) return direct;
    return this.normalizedJaToEn.get(normalizeNameKey(jaName));
  }

  toJapanese(enName: string): string | undefined {
    const direct = this.enToJa.get(enName);
    if (direct !== undefined) return direct;
    return this.normalizedEnToJa.get(normalizeNameKey(enName));
  }

  hasJapaneseName(jaName: string): boolean {
    if (this.jaToEn.has(jaName)) return true;
    return this.normalizedJaToEn.has(normalizeNameKey(jaName));
  }

  hasEnglishName(enName: string): boolean {
    if (this.enToJa.has(enName)) return true;
    return this.normalizedEnToJa.has(normalizeNameKey(enName));
  }

  suggestSimilar(jaName: string, maxResults: number = 3): string[] {
    const candidates: { name: string; distance: number }[] = [];

    for (const name of this.jaNames) {
      const distance = levenshteinDistance(jaName, name);
      candidates.push({ name, distance });
    }

    return candidates
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxResults)
      .filter((c) => c.distance <= Math.ceil(jaName.length / 2))
      .map((c) => c.name);
  }

  allJapaneseNames(): string[] {
    return [...this.jaNames];
  }

  allEnglishNames(): string[] {
    return [...this.enToJa.keys()];
  }

  get size(): number {
    return this.jaToEn.size;
  }
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}
