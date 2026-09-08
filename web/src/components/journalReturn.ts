export interface JournalReturnTarget {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function journalReturnTransform(
  target: JournalReturnTarget | null,
  book: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  narrow: boolean,
) {
  const pivot = narrow ? 0.5 : 0.48;
  const valid = target && Object.values(target).every(Number.isFinite)
    && target.width > 0 && target.height > 0
    && target.x >= 0 && target.x <= viewport.width
    && target.y >= 0 && target.y <= viewport.height;
  if (!valid || book.width <= 0 || book.height <= 0) {
    return { x: 0, y: 0, scale: 0.86, hasTarget: false };
  }
  return {
    x: target.x - (book.x + book.width * pivot),
    y: target.y - (book.y + book.height / 2),
    scale: Math.min(1, target.width / (book.width * (narrow ? 1 : 0.22)), target.height / book.height),
    hasTarget: true,
  };
}
