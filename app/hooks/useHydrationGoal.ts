import { useMemo } from 'react';
import {
  calculatePersonalizedHydrationGoal,
  type HydrationProfile,
} from '../utils/hydrationHelpers';

interface HydrationFactors extends HydrationProfile {
  weight?: number;
  height?: number;
  gender?: string;
  climate?: string;
  exercise_frequency?: string;
  age?: number;
}

export function calculateDailyWaterGoal(factors: HydrationFactors): number {
  return calculatePersonalizedHydrationGoal(factors);
}

/**
 * Get dynamic quick-add presets based on daily goal
 * Provides 6 preset amounts that make sense for the user's goal
 */
export function getDynamicQuickAddPresets(dailyGoal: number): number[] {
  const eighthOfGoal = Math.round(dailyGoal / 8);
  const quarterOfGoal = Math.round(dailyGoal / 4);
  const thirdOfGoal = Math.round(dailyGoal / 3);
  const halfGoal = Math.round(dailyGoal / 2);

  return [
    Math.round(eighthOfGoal / 50) * 50, // Round to nearest 50
    Math.round(quarterOfGoal / 50) * 50,
    Math.round(thirdOfGoal / 50) * 50,
    Math.round((eighthOfGoal * 1.5) / 50) * 50,
    Math.round(halfGoal / 50) * 50,
    Math.round((halfGoal * 1.5) / 50) * 50,
  ];
}

/**
 * Calculate remaining water to drink to stay on pace
 */
export function calculateHydrationPace(
  currentAmount: number,
  dailyGoal: number,
  timeOfDay: 'morning' | 'afternoon' | 'evening'
): { remaining: number; isOnPace: boolean; message: string } {
  const now = new Date();
  const hour = now.getHours();

  // Define expected amounts at different times
  let expectedAmount = 0;
  if (hour < 12) {
    // Morning: should have ~25% by 10am
    expectedAmount = Math.round(dailyGoal * 0.25);
  } else if (hour < 17) {
    // Afternoon: should have ~65% by 3pm
    expectedAmount = Math.round(dailyGoal * 0.65);
  } else {
    // Evening: should have ~85% by 6pm
    expectedAmount = Math.round(dailyGoal * 0.85);
  }

  const isOnPace = currentAmount >= expectedAmount;
  const remaining = Math.max(0, dailyGoal - currentAmount);

  let message = '';
  if (isOnPace && remaining > 0) {
    message = `Great! You're on track. ${remaining}ml to go!`;
  } else if (!isOnPace) {
    const behindBy = expectedAmount - currentAmount;
    message = `You're ${behindBy}ml behind. Drink now to stay on track!`;
  } else {
    message = `Amazing! You've reached your goal!`;
  }

  return { remaining, isOnPace, message };
}

/**
 * Hook to use hydration goal calculations
 */
export function useHydrationGoal(factors: HydrationFactors) {
  const goal = useMemo(() => calculateDailyWaterGoal(factors), [factors]);
  const presets = useMemo(() => getDynamicQuickAddPresets(goal), [goal]);

  return { goal, presets };
}
