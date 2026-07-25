export interface RandomResult {
  value: number;
  state: number;
}

export function nextRandom(state: number): RandomResult {
  const unsignedState = state >>> 0;
  const nextState =
    (Math.imul(unsignedState, 1_664_525) + 1_013_904_223) >>> 0;
  return { state: nextState, value: nextState / 0x1_0000_0000 };
}
