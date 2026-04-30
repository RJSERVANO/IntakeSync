<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;

class OnboardingController extends Controller
{
    /**
     * Get onboarding data for the authenticated user
     */
    public function show(Request $request)
    {
        try {
            $user = $request->user();

            $data = [
                'name' => $user->name,
                'nickname' => $user->nickname,
                'email' => $user->email,
                'age' => $user->age,
                'first_medication_time' => $user->first_medication_time,
                'end_of_day_time' => $user->end_of_day_time,
                'wake_up_time' => $user->wake_up_time,
                'breakfast_time' => $user->breakfast_time,
                'lunch_time' => $user->lunch_time,
                'dinner_time' => $user->dinner_time,
                'climate' => $user->climate,
                'exercise_frequency' => $user->exercise_frequency,
                'weight' => $user->weight,
                'weight_unit' => $user->weight_unit,
                'daily_hydration_goal' => $user->hydration_goal,
                'hydration_goal' => $user->hydration_goal,
                'reminder_tone' => $user->reminder_tone,
                'notification_permissions_accepted' => $user->notification_permissions_accepted,
                'battery_optimization_set' => $user->battery_optimization_set,
                'emergency_contact' => $user->emergency_contact,
                'emergency_contact_name' => $user->emergency_contact_name,
                'emergency_contact_phone' => $user->emergency_contact_phone,
                'emergencyContact' => [
                    'name' => $user->emergency_contact_name,
                    'phone' => $user->emergency_contact_phone,
                ],
            ];

            return response()->json(['data' => $data], 200);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Failed to load onboarding data',
                'error' => app()->environment('production') ? null : $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Update onboarding data
     */
    public function update(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'nickname' => 'nullable|string|max:100',
            'weight' => 'nullable|numeric|min:0|max:550',
            'weight_unit' => 'nullable|in:kg,lbs',
            'climate' => 'nullable|string|in:hot,temperate,cold',
            'exercise_frequency' => 'nullable|string|in:rarely,sometimes,regularly,often',
            'notification_permissions_accepted' => 'nullable|boolean',
            'daily_hydration_goal' => 'nullable|integer|min:500|max:5000',
        ]);

        $updates = [];

        foreach ([
            'nickname',
            'weight',
            'weight_unit',
            'climate',
            'exercise_frequency',
            'notification_permissions_accepted',
        ] as $field) {
            if (array_key_exists($field, $validated)) {
                $updates[$field] = $validated[$field];
            }
        }

        if (array_key_exists('daily_hydration_goal', $validated)) {
            $updates['hydration_goal'] = $validated['daily_hydration_goal'];
        }

        $user->fill($updates);
        $user->save();

        return response()->json([
            'message' => 'Onboarding data updated successfully',
            'user' => $user->fresh(),
        ]);
    }

    /**
     * Complete onboarding
     */
    public function complete(Request $request)
    {
        $user = $request->user();
        $data = $request->validate([
            'daily_hydration_goal' => 'nullable|integer|min:500|max:5000',
        ]);

        $updates = [
            'onboarding_completed' => true,
        ];

        if (array_key_exists('daily_hydration_goal', $data)) {
            $updates['hydration_goal'] = $data['daily_hydration_goal'];
        }

        $user->update($updates);

        return response()->json([
            'message' => 'Onboarding completed successfully',
            'user' => $user->fresh(),
        ]);
    }

    /**
     * Get onboarding status
     */
    public function status(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'onboarding_completed' => $user->onboarding_completed,
            'user' => $user,
        ]);
    }
}
