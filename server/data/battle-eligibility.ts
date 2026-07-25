export interface BattleEligibilityInput {
  isTemporary: boolean;
  expiresAt: string | null;
}

export function isAvatarBattleEligible(
  avatar: BattleEligibilityInput,
  now: Date
): boolean {
  if (!avatar.isTemporary || avatar.expiresAt === null) return true;
  const expiresAt = Date.parse(avatar.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt > now.getTime();
}
