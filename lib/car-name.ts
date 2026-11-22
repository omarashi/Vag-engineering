export function carName({ make, model, color }: { make?: string; model?: string; color?: string }) {
  return [[make, model].filter(Boolean).join(" "), color].filter(Boolean).join(" · ");
}
