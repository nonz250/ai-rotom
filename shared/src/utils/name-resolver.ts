export interface NameEntry {
  ja: string;
  en: string;
}

export class NameResolver {
  private readonly jaToEn: Map<string, string>;
  private readonly enToJa: Map<string, string>;
  private readonly jaNames: string[];

  constructor(entries: NameEntry[]) {
    this.jaToEn = new Map(entries.map((e) => [e.ja, e.en]));
    this.enToJa = new Map(entries.map((e) => [e.en, e.ja]));
    this.jaNames = entries.map((e) => e.ja);
  }

  toEnglish(jaName: string): string | undefined {
    return this.jaToEn.get(jaName);
  }

  toJapanese(enName: string): string | undefined {
    return this.enToJa.get(enName);
  }

  hasJapaneseName(jaName: string): boolean {
    return this.jaToEn.has(jaName);
  }

  hasEnglishName(enName: string): boolean {
    return this.enToJa.has(enName);
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
