import type { NameResolver } from "../../utils/name-resolver.js";

/**
 * 日本語名または英語名を受け取り、対応する英語名に変換する。
 * 変換できない場合は類似候補を添えて例外を投げる。
 */
export function resolveNameWithFallback(
  resolver: NameResolver,
  name: string,
  label: string,
): string {
  const englishName = resolver.toEnglish(name);
  if (englishName !== undefined) {
    return englishName;
  }

  if (resolver.hasEnglishName(name)) {
    return name;
  }

  const suggestions = resolver.suggestSimilar(name);
  const suggestionMessage =
    suggestions.length > 0
      ? ` もしかして: ${suggestions.join(", ")}`
      : "";
  throw new Error(
    `${label}「${name}」が見つかりません。${suggestionMessage}`,
  );
}

/**
 * `resolveNameWithFallback` の undefined 許容版。
 * name が undefined なら undefined を返し、指定があれば解決する。
 */
export function resolveOptionalName(
  resolver: NameResolver,
  name: string | undefined,
  label: string,
): string | undefined {
  if (name === undefined) {
    return undefined;
  }
  return resolveNameWithFallback(resolver, name, label);
}
