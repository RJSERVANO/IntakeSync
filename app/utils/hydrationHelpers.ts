export interface HydrationProfile {
  weight?: number;
  weight_unit?: 'kg' | 'lbs' | string;
  climate?: 'hot' | 'temperate' | 'cold' | string;
  exercise_frequency?: 'rarely' | 'sometimes' | 'regularly' | 'often' | string;
  daily_hydration_goal?: number;
  hydration_goal?: number;
  daily_goal_ml?: number;
}

export function normalizeClimate(value?: string): 'hot' | 'temperate' | 'cold' | undefined {
  if (!value) return undefined;

  const normalized = value.toLowerCase();

  if (['hot', 'tropical', 'warm'].includes(normalized)) return 'hot';
  if (['cold', 'cool'].includes(normalized)) return 'cold';
  if (['temperate', 'moderate', 'normal'].includes(normalized)) return 'temperate';

  return undefined;
}

export function normalizeExerciseFrequency(
  value?: string
): 'rarely' | 'sometimes' | 'regularly' | 'often' | undefined {
  if (!value) return undefined;

  const normalized = value.toLowerCase();

  if (['rarely', 'low', 'none', 'sedentary'].includes(normalized)) return 'rarely';
  if (['sometimes', 'moderate', 'occasional'].includes(normalized)) return 'sometimes';
  if (['regularly', 'regular'].includes(normalized)) return 'regularly';
  if (['often', 'daily', 'high', 'active'].includes(normalized)) return 'often';

  return undefined;
}

/**
 * Calculates an estimated daily water goal in ml.
 * This is only a general estimate, not a medical prescription.
 */
export function calculatePersonalizedHydrationGoal(profile: HydrationProfile): number {
  const unit = profile?.weight_unit || 'kg';
  let weightKg = Number(profile?.weight || 0);

  if (unit === 'lbs' && weightKg) {
    weightKg = weightKg * 0.453592;
  }

  if (!weightKg || weightKg <= 0) {
    return 2000;
  }

  let goal = weightKg * 35;

  const climate = normalizeClimate(profile?.climate);
  const exercise = normalizeExerciseFrequency(profile?.exercise_frequency);

  if (climate === 'hot') goal += 500;
  if (climate === 'cold') goal -= 100;

  if (exercise === 'sometimes') goal += 250;
  if (exercise === 'regularly') goal += 500;
  if (exercise === 'often') goal += 750;

  goal = Math.min(4500, Math.max(1500, goal));

  return Math.round(goal / 100) * 100;
}

export function resolveHydrationGoal(profile?: HydrationProfile | null): number {
  const savedGoal = Number(
    profile?.daily_hydration_goal || profile?.daily_goal_ml || profile?.hydration_goal || 0
  );

  if (savedGoal > 0) {
    return savedGoal;
  }

  return calculatePersonalizedHydrationGoal(profile || {});
}
