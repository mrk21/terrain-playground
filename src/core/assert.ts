/**
 * nullable な値を受け取り、null/undefined なら例外を投げて非 null 値を返す。
 * 「その文脈では値が存在すると分かっているが、API の型は nullable」な箇所
 * （例: 対象の要素が必ず存在する前提で呼ぶ `document.querySelector`）で、
 * これまで `!`（non-null assertion）で潰していたものの代替に使う。`!` と違い
 * 実行時に検証し、想定が崩れていれば message とともに即座に落ちる。
 */
export function throwOnNullable<T>(
  value: T | null | undefined,
  message?: string,
): NonNullable<T> {
  if (value == null) {
    throw new Error(message ?? "値が null または undefined です。");
  }
  return value;
}
