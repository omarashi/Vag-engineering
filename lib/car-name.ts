export function carName({ make, model, color }: { make?: string; model?: string; color?: string }) {
  return [model?.trim() || make?.trim(), color?.trim()].filter(Boolean).join(" ");
}
