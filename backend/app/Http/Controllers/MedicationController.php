<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Medication;
use App\Models\MedicationHistory;
use App\Models\Notification as NotificationModel;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class MedicationController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $meds = Medication::where('user_id', $user->id)->get();
        return response()->json($meds);
    }

    public function store(Request $request)
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'dosage' => 'nullable|string|max:100',
            'times' => 'nullable|array',
            'times.*' => 'date',
            'reminder' => 'boolean',
            'start_date' => 'nullable|date|after_or_equal:today',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'frequency' => 'nullable|string|in:daily,weekly,monthly,custom',
            'days_of_week' => 'nullable|array',
            'days_of_week.*' => 'integer|between:0,6',
            'notes' => 'nullable|string|max:500',
            'color' => 'nullable|string|max:7',
            'otc_medicine_id' => 'nullable|integer',
            'otc_metadata' => 'nullable|array',
            'client_uuid' => 'nullable|string|max:191',
            'local_id' => 'nullable|string|max:191',
        ], [
            'start_date.after_or_equal' => 'Start date cannot be in the past. Please select today or a future date.',
            'end_date.after_or_equal' => 'End date cannot be before the start date.',
        ]);

        $clientUuid = $data['client_uuid'] ?? $data['local_id'] ?? null;
        unset($data['local_id']);

        if ($clientUuid) {
            $existing = Medication::withTrashed()
                ->where('user_id', $user->id)
                ->where('client_uuid', $clientUuid)
                ->first();

            if ($existing) {
                return response()->json($existing, 200);
            }

            $data['client_uuid'] = $clientUuid;
        }

        $data['user_id'] = $user->id;

        // Set default values
        $data['reminder'] = $data['reminder'] ?? true;
        $data['frequency'] = $data['frequency'] ?? 'daily';
        $data['start_date'] = $data['start_date'] ?? now()->toDateString();
        $data['color'] = $data['color'] ?? '#1E3A8A';

        $med = Medication::create($data);
        Log::debug('Medication created', ['medication_id' => $med->id, 'user_id' => $user->id]);

        return response()->json($med, 201);
    }

    public function show(Request $request, Medication $medication)
    {
        $this->authorizeForUser($request->user(), 'view', $medication);
        return response()->json($medication);
    }

    public function update(Request $request, Medication $medication)
    {
        $this->authorizeForUser($request->user(), 'update', $medication);
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'dosage' => 'nullable|string|max:100',
            'times' => 'nullable|array',
            'times.*' => 'date',
            'reminder' => 'boolean',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'frequency' => 'nullable|string|in:daily,weekly,monthly,custom',
            'days_of_week' => 'nullable|array',
            'days_of_week.*' => 'integer|between:0,6',
            'notes' => 'nullable|string|max:500',
            'color' => 'nullable|string|max:7',
            'otc_medicine_id' => 'nullable|integer',
            'otc_metadata' => 'nullable|array',
            'client_uuid' => 'nullable|string|max:191',
            'local_id' => 'nullable|string|max:191',
        ], [
            'end_date.after_or_equal' => 'End date cannot be before the start date.',
        ]);
        if (array_key_exists('start_date', $data)) {
            $requestedStart = \Carbon\Carbon::parse($data['start_date'])->toDateString();
            $currentStart = $medication->start_date ? \Carbon\Carbon::parse($medication->start_date)->toDateString() : null;

            if ($requestedStart !== $currentStart && \Carbon\Carbon::parse($requestedStart)->lt(now()->startOfDay())) {
                return response()->json([
                    'message' => 'Start date cannot be in the past. Please select today or a future date.',
                    'errors' => [
                        'start_date' => ['Start date cannot be in the past. Please select today or a future date.'],
                    ],
                ], 422);
            }
        }

        unset($data['local_id'], $data['client_uuid']);
        $medication->update($data);
        Log::debug('Medication updated', ['medication_id' => $medication->id]);
        return response()->json($medication);
    }

    public function destroy(Request $request, Medication $medication)
    {
        $user = $request->user();
        Log::debug('MedicationController::destroy called', [
            'request_user' => $user ? $user->id : null,
            'medication_id' => $medication->id,
            'medication_owner' => $medication->user_id ?? null,
        ]);

        $this->authorizeForUser($user, 'delete', $medication);
        $medication->history()->whereNull('medication_name_snapshot')->update([
            'medication_name_snapshot' => $medication->name,
            'dosage_snapshot' => $medication->dosage,
        ]);
        $medication->delete();
        Log::debug('MedicationController::destroy success', ['medication_id' => $medication->id]);
        return response()->json(null, 204);
    }

    public function addHistory(Request $request, Medication $medication)
    {
        $user = $request->user();
        $this->authorizeForUser($user, 'view', $medication);
        $data = $request->validate([
            'status' => 'required|string',
            'time' => 'required|date',
            'client_uuid' => 'nullable|string|max:191',
            'local_id' => 'nullable|string|max:191',
        ]);

        $clientUuid = $data['client_uuid'] ?? $data['local_id'] ?? null;
        if ($clientUuid) {
            $existingByClient = MedicationHistory::where('user_id', $user->id)
                ->where('client_uuid', $clientUuid)
                ->first();

            if ($existingByClient) {
                return response()->json($existingByClient, 200);
            }
        }

        Log::info('addHistory called', [
            'user_id' => $user->id,
            'medication_id' => $medication->id,
            'status' => $data['status'],
            'time' => $data['time'],
        ]);

        $scheduledTime = $this->normalizeDoseTime(Carbon::parse($data['time']));
        $existingEntry = $this->findExistingDoseHistory($medication->id, $scheduledTime);

        if ($existingEntry) {
            Log::warning('Duplicate entry detected', [
                'existing_id' => $existingEntry->id,
                'existing_status' => $existingEntry->status,
                'new_status' => $data['status'],
            ]);
            // If trying to mark as completed but already marked as skipped, allow update
            if ($data['status'] === 'completed' && in_array($existingEntry->status, ['skipped', 'missed'], true)) {
                $existingEntry->update([
                    'status' => 'completed',
                    'time' => $scheduledTime,
                    'scheduled_time' => $scheduledTime,
                    'taken_time' => now(),
                ]);
                Log::info('Updated missed/skipped to completed', ['entry_id' => $existingEntry->id]);
                $updatedEntry = $existingEntry->fresh();
                $this->persistMedicationActivityNotification($updatedEntry, $medication, $user);
                return response()->json($updatedEntry, 200);
            }

            if ($data['status'] === 'completed' && $existingEntry->status === 'snoozed') {
                $existingEntry->update([
                    'status' => 'completed',
                    'time' => $scheduledTime,
                    'scheduled_time' => $scheduledTime,
                    'taken_time' => now(),
                ]);
                $updatedEntry = $existingEntry->fresh();
                $this->persistMedicationActivityNotification($updatedEntry, $medication, $user);
                return response()->json($updatedEntry, 200);
            }

            // If trying to mark as skipped/missed but already marked as completed, don't allow
            if (in_array($data['status'], ['skipped', 'missed'], true) && $existingEntry->status === 'completed') {
                return response()->json([
                    'message' => 'This medication has already been marked as completed for this scheduled time',
                    'existing_entry' => $existingEntry
                ], 409);
            }
            // Same status - duplicate
            return response()->json([
                'message' => 'An entry already exists for this scheduled time',
                'existing_entry' => $existingEntry
            ], 409); // Conflict status
        }

        $hist = MedicationHistory::create([
            'medication_id' => $medication->id,
            'user_id' => $user->id,
            'client_uuid' => $clientUuid,
            'status' => $data['status'],
            'time' => $scheduledTime,
            'scheduled_time' => $scheduledTime,
            'taken_time' => $data['status'] === 'completed' ? now() : null,
            'medication_name_snapshot' => $medication->name,
            'dosage_snapshot' => $medication->dosage,
        ]);

        Log::info('History entry created', [
            'entry_id' => $hist->id,
            'medication_id' => $hist->medication_id,
            'user_id' => $hist->user_id,
            'status' => $hist->status,
        ]);

        $this->persistMedicationActivityNotification($hist, $medication, $user);

        return response()->json($hist, 201);
    }

    public function history(Request $request, Medication $medication)
    {
        $user = $request->user();
        $this->authorizeForUser($user, 'view', $medication);
        $historyEntries = $this->dedupeMedicationHistory(
            $medication->history()->orderBy('time', 'desc')->orderBy('created_at', 'desc')->get()
        );
        Log::info('History retrieved', [
            'user_id' => $user->id,
            'medication_id' => $medication->id,
            'count' => $historyEntries->count(),
        ]);
        return response()->json($historyEntries);
    }

    public function allHistory(Request $request)
    {
        $user = $request->user();
        $historyEntries = $this->dedupeMedicationHistory(
            MedicationHistory::with('medication')
                ->where('user_id', $user->id)
                ->orderBy('time', 'desc')
                ->orderBy('created_at', 'desc')
                ->get()
        )->map(fn($entry) => $this->serializeHistoryEntry($entry));

        return response()->json($historyEntries->values());
    }

    public function getUpcoming(Request $request)
    {
        $user = $request->user();
        $medications = Medication::where('user_id', $user->id)
            ->where('reminder', true)
            ->get();

        $upcoming = [];
        foreach ($medications as $med) {
            $times = $med->times ?? [];
            foreach ($times as $time) {
                $nextTime = $this->calculateNextReminderTime($time, $med);
                if ($nextTime) {
                    $upcoming[] = [
                        'medication' => $med,
                        'next_reminder' => $nextTime,
                        'time_string' => $time,
                    ];
                }
            }
        }

        // Sort by next reminder time
        usort($upcoming, function ($a, $b) {
            return strtotime($a['next_reminder']) - strtotime($b['next_reminder']);
        });

        return response()->json($upcoming);
    }

    private function calculateNextReminderTime($timeString, $medication)
    {
        $today = now();
        $time = \Carbon\Carbon::parse($timeString);

        // Set today's date with the medication time
        $nextReminder = $today->copy()->setTime($time->hour, $time->minute, $time->second);

        // If the time has already passed today, move to tomorrow
        if ($nextReminder->isPast()) {
            $nextReminder->addDay();
        }

        // Check if medication has end date
        if ($medication->end_date && $nextReminder->gt($medication->end_date)) {
            return null;
        }

        return $nextReminder->toISOString();
    }

    public function getStats(Request $request)
    {
        $user = $request->user();
        $medications = Medication::where('user_id', $user->id)->get();
        $this->autoMarkMissedMedications($user);

        $stats = [
            'total_medications' => Medication::withTrashed()->where('user_id', $user->id)->count(),
            'active_medications' => $medications
                ->filter(fn($med) => $med->active !== false && (!$med->end_date || Carbon::parse($med->end_date)->endOfDay()->gte(now())))
                ->count(),
            'total_reminders_today' => 0,
            'completed_today' => 0,
            'missed_today' => 0,
        ];

        $now = now();
        $todayStart = $now->copy()->startOfDay();
        $todayEnd = $now->copy()->endOfDay();

        foreach ($medications as $med) {
            $stats['total_reminders_today'] += count($this->scheduledDosesForDate($med, $now));
        }

        $todayHistory = $this->dedupeMedicationHistory(
            MedicationHistory::where('user_id', $user->id)
                ->whereBetween('time', [$todayStart, $todayEnd])
                ->get()
        );

        $stats['completed_today'] = $todayHistory->where('status', 'completed')->count();
        $stats['missed_today'] = $todayHistory->whereIn('status', ['skipped', 'missed'])->count();

        return response()->json($stats);
    }

    private function serializeHistoryEntry(MedicationHistory $entry): array
    {
        $medication = $entry->medication;
        return [
            'id' => $entry->id,
            'medication_id' => $entry->medication_id,
            'user_id' => $entry->user_id,
            'client_uuid' => $entry->client_uuid,
            'status' => $entry->status,
            'time' => optional($entry->time)->toISOString(),
            'scheduled_time' => optional($entry->scheduled_time ?: $entry->time)->toISOString(),
            'taken_time' => optional($entry->taken_time)->toISOString(),
            'logged_at' => optional($entry->taken_time ?: $entry->created_at)->toISOString(),
            'created_at' => optional($entry->created_at)->toISOString(),
            'updated_at' => optional($entry->updated_at)->toISOString(),
            'medication_name_snapshot' => $entry->medication_name_snapshot ?: $medication?->name,
            'dosage_snapshot' => $entry->dosage_snapshot ?: $medication?->dosage,
            'medication' => $medication ? [
                'id' => $medication->id,
                'name' => $medication->name,
                'dosage' => $medication->dosage,
                'deleted_at' => optional($medication->deleted_at)->toISOString(),
            ] : null,
        ];
    }

    private function normalizeDoseTime(Carbon $date): Carbon
    {
        return $date->copy()->setSecond(0)->setMicrosecond(0);
    }

    private function doseKey(int|string $medicationId, Carbon $date): string
    {
        return $medicationId . ':' . $this->normalizeDoseTime($date)->format('Y-m-d H:i');
    }

    private function historyDoseTime(MedicationHistory $entry): Carbon
    {
        return $this->normalizeDoseTime(Carbon::parse($entry->scheduled_time ?: $entry->time));
    }

    private function historyStatusPriority(?string $status): int
    {
        return match ($status) {
            'completed' => 4,
            'snoozed' => 3,
            'skipped', 'missed' => 2,
            default => 1,
        };
    }

    private function dedupeMedicationHistory($entries)
    {
        return $entries
            ->sortByDesc(fn($entry) => optional($entry->created_at)->timestamp ?? 0)
            ->reduce(function ($carry, $entry) {
                $key = $this->doseKey($entry->medication_id, $this->historyDoseTime($entry));
                $existing = $carry->get($key);
                if (!$existing) {
                    $carry->put($key, $entry);
                    return $carry;
                }

                $entryPriority = $this->historyStatusPriority($entry->status);
                $existingPriority = $this->historyStatusPriority($existing->status);
                if (
                    $entryPriority > $existingPriority ||
                    ($entryPriority === $existingPriority && optional($entry->created_at)->gt($existing->created_at))
                ) {
                    $carry->put($key, $entry);
                }

                return $carry;
            }, collect())
            ->values()
            ->sortByDesc(fn($entry) => optional($entry->time)->timestamp ?? optional($entry->created_at)->timestamp ?? 0)
            ->values();
    }

    private function findExistingDoseHistory(int|string $medicationId, Carbon $scheduledTime): ?MedicationHistory
    {
        $scheduledTime = $this->normalizeDoseTime($scheduledTime);
        return MedicationHistory::where('medication_id', $medicationId)
            ->where(function ($query) use ($scheduledTime) {
                $query->whereBetween('scheduled_time', [$scheduledTime, $scheduledTime->copy()->addSeconds(59)])
                    ->orWhere(function ($fallback) use ($scheduledTime) {
                        $fallback->whereNull('scheduled_time')
                            ->whereBetween('time', [$scheduledTime, $scheduledTime->copy()->addSeconds(59)]);
                    });
            })
            ->orderByRaw("CASE status WHEN 'completed' THEN 4 WHEN 'snoozed' THEN 3 WHEN 'skipped' THEN 2 WHEN 'missed' THEN 2 ELSE 1 END DESC")
            ->latest('created_at')
            ->first();
    }

    private function hasFutureSnooze(Medication $medication, Carbon $now): bool
    {
        return MedicationHistory::where('medication_id', $medication->id)
            ->where('status', 'snoozed')
            ->where('time', '>', $now)
            ->exists();
    }

    private function scheduledDosesForDate(Medication $medication, Carbon $date): array
    {
        if (!$this->isMedicationScheduledOnDate($medication, $date)) {
            return [];
        }

        $times = is_array($medication->times) ? $medication->times : [];
        $doses = [];
        foreach ($times as $timeStr) {
            $time = Carbon::parse($timeStr);
            $scheduled = $this->normalizeDoseTime($date->copy()->setTime($time->hour, $time->minute, 0));

            if ($medication->created_at && $scheduled->lt($this->normalizeDoseTime(Carbon::parse($medication->created_at)))) {
                continue;
            }

            $doses[$this->doseKey($medication->id, $scheduled)] = $scheduled;
        }

        return array_values($doses);
    }

    private function autoMarkMissedMedications($user): void
    {
        $now = now();
        $graceCutoff = $now->copy()->subMinutes(30);
        $medications = Medication::where('user_id', $user->id)
            ->where('reminder', true)
            ->get();

        foreach ($medications as $medication) {
            if ($this->hasFutureSnooze($medication, $now)) {
                continue;
            }

            foreach ($this->scheduledDosesForDate($medication, $now) as $scheduled) {
                if ($scheduled->gt($graceCutoff)) {
                    continue;
                }

                $existing = $this->findExistingDoseHistory($medication->id, $scheduled);
                if ($existing) {
                    continue;
                }

                $history = MedicationHistory::create([
                    'medication_id' => $medication->id,
                    'user_id' => $medication->user_id,
                    'status' => 'skipped',
                    'time' => $scheduled,
                    'scheduled_time' => $scheduled,
                    'taken_time' => null,
                    'medication_name_snapshot' => $medication->name,
                    'dosage_snapshot' => $medication->dosage,
                ]);

                $this->persistMedicationActivityNotification($history, $medication, $user);
            }
        }
    }

    private function persistMedicationActivityNotification(MedicationHistory $history, Medication $medication, $user): void
    {
        if (!class_exists(NotificationModel::class)) {
            return;
        }

        try {
            $status = strtolower((string) $history->status);
            $notificationStatus = match ($status) {
                'completed', 'taken' => 'completed',
                'missed', 'skipped' => 'missed',
                'snoozed' => 'snoozed',
                default => 'scheduled',
            };
            $scheduledTime = $history->scheduled_time ?: $history->time ?: now();
            $medicationName = $history->medication_name_snapshot ?: $medication->name ?: 'Medication';
            $statusLabel = match ($notificationStatus) {
                'completed' => 'completed',
                'missed' => 'missed',
                'snoozed' => 'snoozed',
                default => 'updated',
            };
            $timestamps = [];

            if ($notificationStatus === 'completed') {
                $timestamps['completed_at'] = $history->taken_time ?: $history->updated_at ?: now();
                $timestamps['actioned_at'] = $timestamps['completed_at'];
                $timestamps['opened_at'] = $timestamps['completed_at'];
            } elseif ($notificationStatus === 'missed') {
                $timestamps['missed_at'] = $history->updated_at ?: now();
            } elseif ($notificationStatus === 'snoozed') {
                $timestamps['opened_at'] = $history->updated_at ?: now();
            }

            NotificationModel::firstOrCreate(
                [
                    'user_id' => $user->id,
                    'type' => 'medication',
                    'status' => $notificationStatus,
                    'scheduled_time' => $scheduledTime,
                    'title' => "Medication {$statusLabel}",
                ],
                array_merge([
                    'body' => "{$medicationName} was {$statusLabel}.",
                    'data' => [
                        'source' => 'medication_history',
                        'medication_history_id' => $history->id,
                        'medication_id' => $medication->id,
                    ],
                ], $timestamps)
            );
        } catch (\Throwable $e) {
            Log::warning('Unable to persist medication notification activity', [
                'user_id' => $user->id ?? null,
                'medication_id' => $medication->id ?? null,
                'history_id' => $history->id ?? null,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function isMedicationScheduledOnDate(Medication $medication, Carbon $date): bool
    {
        if ($medication->active === false || !$medication->reminder) {
            return false;
        }

        if ($medication->start_date && Carbon::parse($medication->start_date)->startOfDay()->gt($date->copy()->endOfDay())) {
            return false;
        }

        if ($medication->end_date && Carbon::parse($medication->end_date)->endOfDay()->lt($date->copy()->startOfDay())) {
            return false;
        }

        if ($medication->frequency === 'weekly') {
            return is_array($medication->days_of_week)
                && count($medication->days_of_week) > 0
                && in_array((int) $date->dayOfWeek, array_map('intval', $medication->days_of_week), true);
        }

        if ($medication->frequency === 'monthly') {
            $anchor = $medication->start_date ? Carbon::parse($medication->start_date) : Carbon::parse($medication->created_at);
            return (int) $date->day === (int) $anchor->day;
        }

        if ($medication->frequency === 'custom') {
            return is_array($medication->days_of_week)
                && count($medication->days_of_week) > 0
                && in_array((int) $date->dayOfWeek, array_map('intval', $medication->days_of_week), true);
        }

        return true;
    }

    /**
     * Get admin statistics for medication management
     */
    public function getAdminStats(Request $request)
    {
        $days = (int) $request->query('days', 30);
        if (!in_array($days, [7, 30, 90])) {
            $days = 30;
        }

        try {
            $startDate = now()->subDays($days);

            // Get all medications
            $totalMedications = Medication::count();
            $activeMedications = Medication::where('reminder', true)
                ->where(function ($query) {
                    $query->whereNull('end_date')->orWhereDate('end_date', '>=', now()->toDateString());
                })
                ->count();

            // Calculate adherence rate
            $history = $this->dedupeMedicationHistory(MedicationHistory::where('created_at', '>=', $startDate)->get());
            $totalHistory = $history->count();
            $takenHistory = $history->where('status', 'completed')->count();
            $adherenceRate = $totalHistory > 0 ? round(($takenHistory / $totalHistory) * 100, 1) : 0;

            // Count upcoming doses (medications scheduled for today)
            $upcomingDoses = 0;
            $medications = Medication::where('reminder', true)->get();
            foreach ($medications as $med) {
                $upcomingDoses += count($this->scheduledDosesForDate($med, now()));
            }

            // Count missed doses
            $missedDoses = $history->whereIn('status', ['skipped', 'missed'])->count();

            // Medication types distribution
            $medicationTypes = Medication::selectRaw('name, COUNT(*) as count')
                ->groupBy('name')
                ->orderBy('count', 'desc')
                ->limit(10)
                ->get()
                ->map(function ($item) {
                    return [
                        'type' => $item->name,
                        'count' => $item->count
                    ];
                });

            // Weekly adherence trend
            $weeklyTrend = [];
            $weeks = ceil($days / 7);
            for ($w = $weeks - 1; $w >= 0; $w--) {
                $weekStart = now()->subWeeks($w)->startOfWeek();
                $weekEnd = now()->subWeeks($w)->endOfWeek();

                $weekHistory = $this->dedupeMedicationHistory(
                    MedicationHistory::whereBetween('created_at', [$weekStart, $weekEnd])->get()
                );
                $weekTotal = $weekHistory->count();
                $weekTaken = $weekHistory->where('status', 'completed')->count();

                $weekAdherence = $weekTotal > 0 ? round(($weekTaken / $weekTotal) * 100, 1) : 0;

                $weeklyTrend[] = [
                    'week' => $weekStart->format('M j'),
                    'adherence_rate' => $weekAdherence
                ];
            }

            // Recent medication history
            $recentHistory = $this->dedupeMedicationHistory(
                MedicationHistory::with(['medication.user'])
                    ->orderBy('created_at', 'desc')
                    ->limit(50)
                    ->get()
            )
                ->take(10)
                ->map(function ($entry) {
                    return [
                        'user_name' => $entry->medication->user->name ?? 'Unknown User',
                        'medication_name' => $entry->medication->name ?? 'Unknown Medication',
                        'dosage' => $entry->medication->dosage ?? '',
                        'status' => $entry->status,
                        'scheduled_time' => $entry->created_at->toISOString(),
                        'taken_time' => $entry->status === 'completed' ? $entry->created_at->toISOString() : null
                    ];
                });

            return response()->json([
                'active_medications' => $activeMedications,
                'adherence_rate' => $adherenceRate,
                'upcoming_doses' => $upcomingDoses,
                'missed_doses' => $missedDoses,
                'taken_count' => $takenHistory,
                'missed_count' => $missedDoses,
                'snoozed_count' => 0, // Not implemented yet
                'medication_types' => $medicationTypes,
                'weekly_adherence' => $weeklyTrend,
                'recent_history' => $recentHistory
            ]);
        } catch (\Exception $e) {
            Log::error('Medication admin stats error', ['error' => $e->getMessage()]);
            return response()->json([
                'active_medications' => 0,
                'adherence_rate' => 0,
                'upcoming_doses' => 0,
                'missed_doses' => 0,
                'taken_count' => 0,
                'missed_count' => 0,
                'snoozed_count' => 0,
                'medication_types' => [],
                'weekly_adherence' => [],
                'recent_history' => []
            ], 500);
        }
    }

    /**
     * Export medication history as CSV
     */
    public function exportCsv(Request $request)
    {
        $user = $request->user();

        $medications = Medication::where('user_id', $user->id)->with('history')->get();

        $csvData = [];
        $csvData[] = ['Medication Name', 'Dosage', 'Scheduled Time', 'Status', 'Date'];

        foreach ($medications as $medication) {
            foreach ($medication->history as $history) {
                $csvData[] = [
                    $medication->name,
                    $medication->dosage ?? '',
                    $history->time,
                    $history->status,
                    $history->created_at->format('Y-m-d H:i:s'),
                ];
            }
        }

        $filename = 'medication_history_' . date('Y-m-d') . '.csv';
        $headers = [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ];

        $output = fopen('php://output', 'w');
        foreach ($csvData as $row) {
            fputcsv($output, $row);
        }
        fclose($output);

        return response()->stream(function () use ($csvData) {
            $output = fopen('php://output', 'w');
            foreach ($csvData as $row) {
                fputcsv($output, $row);
            }
            fclose($output);
        }, 200, $headers);
    }

    /**
     * Export medication history as PDF
     */
    public function exportPdf(Request $request)
    {
        $user = $request->user();

        $medications = Medication::where('user_id', $user->id)->with('history')->get();

        // Generate simple HTML for PDF (can be enhanced with a PDF library like dompdf)
        $html = '<html><head><title>Medication History</title></head><body>';
        $html .= '<h1>Medication History Report</h1>';
        $html .= '<p>Generated on: ' . date('Y-m-d H:i:s') . '</p>';
        $html .= '<p>User: ' . htmlspecialchars($user->name) . '</p>';
        $html .= '<table border="1" cellpadding="5" cellspacing="0" style="width:100%; border-collapse:collapse;">';
        $html .= '<tr><th>Medication Name</th><th>Dosage</th><th>Scheduled Time</th><th>Status</th><th>Date</th></tr>';

        foreach ($medications as $medication) {
            foreach ($medication->history as $history) {
                $html .= '<tr>';
                $html .= '<td>' . htmlspecialchars($medication->name) . '</td>';
                $html .= '<td>' . htmlspecialchars($medication->dosage ?? '') . '</td>';
                $html .= '<td>' . htmlspecialchars($history->time) . '</td>';
                $html .= '<td>' . htmlspecialchars($history->status) . '</td>';
                $html .= '<td>' . htmlspecialchars($history->created_at->format('Y-m-d H:i:s')) . '</td>';
                $html .= '</tr>';
            }
        }

        $html .= '</table></body></html>';

        $filename = 'medication_history_' . date('Y-m-d') . '.html';

        // For now, return HTML. In production, use a PDF library like dompdf or tcpdf
        return response($html, 200)
            ->header('Content-Type', 'text/html')
            ->header('Content-Disposition', 'attachment; filename="' . $filename . '"');
    }
}
