export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function validUsername(value: string) {
  return /^[a-z0-9_.-]{3,30}$/.test(value);
}

export function internalLoginEmail(userId: string) {
  return `${userId}@accounts.vag.invalid`;
}
