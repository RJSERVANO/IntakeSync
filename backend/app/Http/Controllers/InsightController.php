<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use App\Models\Medication;
use App\Models\MedicationHistory;
use App\Models\HydrationEntry;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class InsightController extends Controller
{
    protected function medicationRunsOnDate(Medication $medication, Carbon $date): bool
    {
        if ($medication->active === false || !$medication->reminder) {
            return false;
        }

        if ($medication->start_date && Carbon::parse($medication->start_date)->startOfDay()->gt($date)) {
            return false;
        }

        if ($medication->end_date && Carbon::parse($medication->end_date)->endOfDay()->lt($date)) {
            return false;
        }

        $daysOfWeek = $medication->days_of_week;
        if (is_array($daysOfWeek) && count($daysOfWeek) > 0) {
            $dayTokens = [
                strtolower($date->format('l')),
                strtolower($date->format('D')),
                (string) $date->dayOfWeek,
                (string) ($date->dayOfWeekIso),
            ];
            $normalizedDays = array_map(fn ($day) => strtolower((string) $day), $daysOfWeek);
            return count(array_intersect($dayTokens, $normalizedDays)) > 0;
        }

        return true;
    }

    protected function scheduledDosesForDate($medications, Carbon $date): int
    {
        $total = 0;
        foreach ($medications as $medication) {
            if (!$this->medicationRunsOnDate($medication, $date)) {
                continue;
            }

            $times = is_array($medication->times) ? $medication->times : [];
            $total += count($times);
        }

        return $total;
    }

    protected function serializeHydrationEntry(HydrationEntry $entry): array
    {
        return [
            'id' => $entry->id,
            'amount_ml' => (int) $entry->amount_ml,
            'timestamp' => optional($entry->created_at)->toISOString(),
            'created_at' => optional($entry->created_at)->toISOString(),
            'source' => $entry->source,
            'beverage_type' => $entry->beverage_type,
            'sugar_level' => $entry->sugar_level,
            'caffeine_level' => $entry->caffeine_level,
            'drink_label' => $entry->drink_label,
        ];
    }

    protected function serializeMedicationEvent(MedicationHistory $event): array
    {
        return [
            'id' => $event->id,
            'medication_id' => $event->medication_id,
            'medication_name' => optional($event->medication)->name,
            'status' => $event->status,
            'time' => optional($event->time)->toISOString(),
            'scheduled_time' => optional($event->scheduled_time)->toISOString(),
            'taken_time' => optional($event->taken_time)->toISOString(),
        ];
    }

    /**
     * Get weekly report card
     */
    public function weeklyReportCard(Request $request)
    {
        $user = $request->user();
        
        $startOfWeek = Carbon::now()->startOfWeek(Carbon::SUNDAY);
        $endOfWeek = Carbon::now()->endOfWeek(Carbon::SATURDAY);

        $hydrationEntries = HydrationEntry::where('user_id', $user->id)
            ->whereBetween('created_at', [$startOfWeek, $endOfWeek])
            ->get();

        $hydrationGoal = $user->hydration_goal ?? 2000;
        $totalHydration = $hydrationEntries->sum('amount_ml');
        $daysWithHydrationLogs = $hydrationEntries
            ->groupBy(fn ($entry) => Carbon::parse($entry->created_at)->toDateString())
            ->count();
        $expectedHydration = $hydrationGoal * 7;
        $hydrationPercentage = $hydrationEntries->count() > 0 && $expectedHydration > 0
            ? round(($totalHydration / $expectedHydration) * 100) 
            : null;

        $medications = Medication::where('user_id', $user->id)->get();
        $totalScheduled = 0;
        $totalCompleted = 0;
        $totalMissed = 0;
        $dailyScores = [];
        $medicationIds = $medications->pluck('id');
        $medicationEvents = MedicationHistory::with('medication')
            ->where('user_id', $user->id)
            ->whereBetween('time', [$startOfWeek, $endOfWeek])
            ->orderBy('time', 'desc')
            ->get();

        for ($date = $startOfWeek->copy(); $date->lte($endOfWeek); $date->addDay()) {
            $dayStart = $date->copy()->startOfDay();
            $dayEnd = $date->copy()->endOfDay();
            $dayHydrationEntries = $hydrationEntries->filter(fn ($entry) => Carbon::parse($entry->created_at)->isSameDay($date));
            $dayHydrationTotal = $dayHydrationEntries->sum('amount_ml');
            $dayHydrationScore = $dayHydrationEntries->count() > 0 && $hydrationGoal > 0
                ? min(100, round(($dayHydrationTotal / $hydrationGoal) * 100))
                : null;

            $dayScheduled = $this->scheduledDosesForDate($medications, $date);
            $dayEvents = $medicationEvents->filter(fn ($event) => Carbon::parse($event->time)->between($dayStart, $dayEnd, true));
            $dayCompleted = $dayEvents->where('status', 'completed')->count();
            $daySkipped = $dayEvents->whereIn('status', ['missed', 'skipped'])->count();
            $dayMedicationScore = $dayScheduled > 0 ? min(100, round(($dayCompleted / $dayScheduled) * 100)) : null;
            $components = array_values(array_filter([$dayHydrationScore, $dayMedicationScore], fn ($score) => $score !== null));
            $dayScore = count($components) > 0 ? round(array_sum($components) / count($components)) : null;

            $totalScheduled += $dayScheduled;
            $totalCompleted += $dayCompleted;
            $totalMissed += $dayScheduled > 0 ? max(0, min($dayScheduled, $dayScheduled - $dayCompleted)) : $daySkipped;

            $dailyScores[] = [
                'day' => substr($date->format('D'), 0, 1),
                'date' => $date->toDateString(),
                'score' => $dayScore,
                'has_data' => $dayScore !== null,
                'hydration_ml' => $dayHydrationTotal,
                'hydration_score' => $dayHydrationScore,
                'medication_scheduled' => $dayScheduled,
                'medication_completed' => $dayCompleted,
                'medication_score' => $dayMedicationScore,
            ];
        }

        $adherenceRate = $totalScheduled > 0
            ? round(($totalCompleted / $totalScheduled) * 100) 
            : null;

        $scoreComponents = array_values(array_filter([$hydrationPercentage, $adherenceRate], fn ($score) => $score !== null));
        $overallScore = count($scoreComponents) > 0 ? round(array_sum($scoreComponents) / count($scoreComponents)) : null;
        $hasData = $overallScore !== null;

        return response()->json([
            'has_data' => $hasData,
            'hydration' => [
                'percentage' => $hydrationPercentage,
                'total_ml' => $totalHydration,
                'goal_ml' => $expectedHydration,
                'daily_goal_ml' => $hydrationGoal,
                'daily_average_ml' => $hydrationEntries->count() > 0 ? round($totalHydration / 7) : null,
                'days_with_logs' => $daysWithHydrationLogs,
                'logs' => $hydrationEntries->sortByDesc('created_at')->values()->map(fn ($entry) => $this->serializeHydrationEntry($entry)),
                'message' => $hydrationEntries->count() > 0
                    ? 'Beverage logs are included in this period.'
                    : 'No beverage logs in this period.',
            ],
            'medications' => [
                'adherence_rate' => $adherenceRate,
                'completed' => $totalCompleted,
                'scheduled' => $totalScheduled,
                'missed' => max(0, $totalMissed),
                'events' => $medicationEvents->values()->map(fn ($event) => $this->serializeMedicationEvent($event)),
                'message' => $totalScheduled > 0
                    ? 'Medication check-ins are included in this period.'
                    : 'No medication schedule data in this period.',
            ],
            'overall_score' => $overallScore,
            'daily_scores' => $dailyScores,
            'week_start' => $startOfWeek->toDateString(),
            'week_end' => $endOfWeek->toDateString(),
        ]);
    }

    /**
     * Pattern detection - identify weak spots
     */
    public function patternDetection(Request $request)
    {
        $user = $request->user();
        
        $patterns = [];
        $thirtyDaysAgo = Carbon::now()->subDays(30);

        // Analyze medication patterns
        $medications = Medication::where('user_id', $user->id)->get();
        
        foreach ($medications as $medication) {
            $history = MedicationHistory::where('medication_id', $medication->id)
                ->where('created_at', '>=', $thirtyDaysAgo)
                ->get();

            // Check for day-of-week patterns
            $missedByDay = [];
            $completedByDay = [];

            foreach ($history as $entry) {
                $dayOfWeek = Carbon::parse($entry->time)->dayOfWeek;
                
                if ($entry->status === 'missed' || $entry->status === 'skipped') {
                    $missedByDay[$dayOfWeek] = ($missedByDay[$dayOfWeek] ?? 0) + 1;
                } elseif ($entry->status === 'completed') {
                    $completedByDay[$dayOfWeek] = ($completedByDay[$dayOfWeek] ?? 0) + 1;
                }
            }

            // Find weak days
            $dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            foreach ($missedByDay as $day => $missedCount) {
                $completedCount = $completedByDay[$day] ?? 0;
                $totalCount = $missedCount + $completedCount;
                
                if ($totalCount > 0 && ($missedCount / $totalCount) > 0.3) {
                    $patterns[] = [
                        'type' => 'day_pattern',
                        'medication' => $medication->name,
                        'pattern' => "You usually miss {$medication->name} on {$dayNames[$day]}s.",
                        'day' => $dayNames[$day],
                        'missed_rate' => round(($missedCount / $totalCount) * 100),
                    ];
                }
            }

            // Check for time-of-day patterns
            $missedByHour = [];
            $completedByHour = [];

            foreach ($history as $entry) {
                $hour = Carbon::parse($entry->time)->hour;
                
                if ($entry->status === 'missed' || $entry->status === 'skipped') {
                    $missedByHour[$hour] = ($missedByHour[$hour] ?? 0) + 1;
                } elseif ($entry->status === 'completed') {
                    $completedByHour[$hour] = ($completedByHour[$hour] ?? 0) + 1;
                }
            }

            // Find weak time slots
            foreach ($missedByHour as $hour => $missedCount) {
                $completedCount = $completedByHour[$hour] ?? 0;
                $totalCount = $missedCount + $completedCount;
                
                if ($totalCount > 3 && ($missedCount / $totalCount) > 0.4) {
                    $timeStr = $hour < 12 ? "{$hour}:00 AM" : ($hour === 12 ? "12:00 PM" : ($hour - 12) . ":00 PM");
                    $patterns[] = [
                        'type' => 'time_pattern',
                        'medication' => $medication->name,
                        'pattern' => "You often miss {$medication->name} around {$timeStr}.",
                        'hour' => $hour,
                        'missed_rate' => round(($missedCount / $totalCount) * 100),
                    ];
                }
            }
        }

        return response()->json([
            'patterns' => $patterns,
            'analysis_period' => '30 days',
        ]);
    }

    /**
     * Snooze analyzer - track repeated snoozes and suggest reschedule
     */
    public function snoozeAnalysis(Request $request)
    {
        $user = $request->user();
        
        $suggestions = [];
        $sevenDaysAgo = Carbon::now()->subDays(7);

        // Get all notifications that were snoozed
        $snoozedNotifications = DB::table('notifications')
            ->where('user_id', $user->id)
            ->where('status', 'scheduled')
            ->where('created_at', '>=', $sevenDaysAgo)
            ->get();

        // Group by medication and time
        $snoozePatterns = [];

        foreach ($snoozedNotifications as $notification) {
            $data = json_decode($notification->data ?? '{}', true);
            $medicationId = $data['medication_id'] ?? null;
            $scheduledTime = Carbon::parse($notification->scheduled_time);
            $hour = $scheduledTime->hour;
            $minute = $scheduledTime->minute;

            if ($medicationId) {
                $key = "{$medicationId}_{$hour}_{$minute}";
                if (!isset($snoozePatterns[$key])) {
                    $snoozePatterns[$key] = [
                        'medication_id' => $medicationId,
                        'hour' => $hour,
                        'minute' => $minute,
                        'count' => 0,
                        'dates' => [],
                    ];
                }
                $snoozePatterns[$key]['count']++;
                $snoozePatterns[$key]['dates'][] = $scheduledTime->toDateString();
            }
        }

        // Find patterns where same reminder was snoozed 3+ days in a row
        foreach ($snoozePatterns as $pattern) {
            if ($pattern['count'] >= 3) {
                $uniqueDates = array_unique($pattern['dates']);
                sort($uniqueDates);
                
                // Check for consecutive days
                $consecutive = 1;
                $maxConsecutive = 1;
                for ($i = 1; $i < count($uniqueDates); $i++) {
                    $prev = Carbon::parse($uniqueDates[$i - 1]);
                    $curr = Carbon::parse($uniqueDates[$i]);
                    if ($curr->diffInDays($prev) === 1) {
                        $consecutive++;
                        $maxConsecutive = max($maxConsecutive, $consecutive);
                    } else {
                        $consecutive = 1;
                    }
                }

                if ($maxConsecutive >= 3) {
                    $medication = Medication::find($pattern['medication_id']);
                    if ($medication) {
                        $currentTime = sprintf('%02d:%02d', $pattern['hour'], $pattern['minute']);
                        $suggestedMinute = $pattern['minute'] + 30;
                        $suggestedHour = $pattern['hour'];
                        if ($suggestedMinute >= 60) {
                            $suggestedMinute -= 60;
                            $suggestedHour = ($suggestedHour + 1) % 24;
                        }
                        $suggestedTime = sprintf('%02d:%02d', $suggestedHour, $suggestedMinute);
                        
                        $suggestions[] = [
                            'medication_id' => $pattern['medication_id'],
                            'medication_name' => $medication->name,
                            'current_time' => $currentTime,
                            'suggested_time' => $suggestedTime,
                            'message' => "You often snooze {$medication->name} at {$currentTime}. Move this reminder to {$suggestedTime}?",
                            'snooze_count' => $pattern['count'],
                            'consecutive_days' => $maxConsecutive,
                        ];
                    }
                }
            }
        }

        return response()->json([
            'suggestions' => $suggestions,
            'analysis_period' => '7 days',
        ]);
    }
}
