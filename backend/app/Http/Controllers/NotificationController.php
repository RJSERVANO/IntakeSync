<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Schema;
use App\Models\Notification as NotificationModel;
use App\Models\User;
use Carbon\Carbon;

class NotificationController extends Controller
{
    /**
     * Get all notifications for the authenticated user
     */
    public function index(Request $request)
    {
        $user = $request->user();
        
        $limit = max(1, min((int) $request->query('limit', 80), 150));

        $notifications = NotificationModel::where('user_id', $user->id)
            ->where('status', '!=', 'cleared')
            ->orderBy('scheduled_time', 'desc')
            ->orderBy('created_at', 'desc')
            ->limit($limit)
            ->get();

        return response()->json($notifications);
    }

    /**
     * Store a new notification
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'type' => 'required|in:hydration,medication,general',
            'title' => 'required|string|max:255',
            'body' => 'required_without:message|string|max:500',
            'message' => 'required_without:body|string|max:500',
            'scheduled_time' => 'required_without:scheduled_at|date',
            'scheduled_at' => 'required_without:scheduled_time|date',
            'status' => 'required|in:scheduled,delivered,missed,completed,snoozed,cleared',
            'data' => 'nullable|array',
            'metadata' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = $request->user();
        
        $notification = NotificationModel::create([
            'user_id' => $user->id,
            'type' => $request->type,
            'title' => $request->title,
            'body' => $request->body ?? $request->message,
            'scheduled_time' => $request->scheduled_time ?? $request->scheduled_at,
            'status' => $request->status,
            'data' => $request->metadata ?? $request->data,
        ]);

        return response()->json($notification, 201);
    }

    /**
     * Update a notification
     */
    public function update(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'status' => 'sometimes|in:scheduled,delivered,missed,completed,snoozed,cleared',
            'scheduled_time' => 'sometimes|required_without:scheduled_at|date',
            'scheduled_at' => 'sometimes|required_without:scheduled_time|date',
            'opened_at' => 'sometimes|nullable|date',
            'read_at' => 'sometimes|nullable|date',
            'data' => 'nullable|array',
            'metadata' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = $request->user();
        
        $notification = NotificationModel::where('id', $id)
            ->where('user_id', $user->id)
            ->first();

        if (!$notification) {
            return response()->json(['error' => 'Notification not found'], 404);
        }

        $updateData = [];
        if ($request->has('status')) {
            $updateData['status'] = $request->status;
        }
        if ($request->has('scheduled_time') || $request->has('scheduled_at')) {
            $updateData['scheduled_time'] = $request->scheduled_time ?? $request->scheduled_at;
        }
        if ($request->has('opened_at') && Schema::hasColumn('notifications', 'opened_at')) {
            $updateData['opened_at'] = $request->opened_at ? Carbon::parse($request->opened_at) : Carbon::now();
        }
        if ($request->has('read_at') && Schema::hasColumn('notifications', 'read_at')) {
            $updateData['read_at'] = $request->read_at ? Carbon::parse($request->read_at) : Carbon::now();
        }
        if ($request->has('data') || $request->has('metadata')) {
            $updateData['data'] = $request->metadata ?? $request->data;
        }

        $notification->update($updateData);

        return response()->json($notification);
    }

    /**
     * Delete a notification
     */
    public function destroy(Request $request, $id)
    {
        $user = $request->user();
        
        $notification = NotificationModel::where('id', $id)
            ->where('user_id', $user->id)
            ->first();

        if (!$notification) {
            return response()->json(['error' => 'Notification not found'], 404);
        }

        $notification->delete();

        return response()->json(['message' => 'Notification deleted successfully']);
    }

    /**
     * Mark notification reminders as read without changing health history.
     */
    public function markAllAsRead(Request $request)
    {
        $user = $request->user();
        $readColumn = null;

        if (Schema::hasColumn('notifications', 'opened_at')) {
            $readColumn = 'opened_at';
        } elseif (Schema::hasColumn('notifications', 'read_at')) {
            $readColumn = 'read_at';
        }

        if (!$readColumn) {
            return response()->json([
                'message' => 'Notification read tracking is not configured.',
            ], 500);
        }

        $updated = NotificationModel::where('user_id', $user->id)
            ->whereNull($readColumn)
            ->update([
                $readColumn => Carbon::now(),
            ]);

        return response()->json([
            'message' => 'Notifications marked as read',
            'updated' => $updated,
        ]);
    }

    /**
     * Clear notification/reminder rows only. This does not delete medication or hydration records.
     */
    public function clearAll(Request $request)
    {
        $user = $request->user();

        try {
            $affected = NotificationModel::where('user_id', $user->id)
                ->update(['status' => 'cleared']);
        } catch (\Throwable $e) {
            $affected = NotificationModel::where('user_id', $user->id)->delete();
        }

        return response()->json([
            'message' => 'Notifications cleared',
            'cleared' => $affected,
        ]);
    }

    /**
     * Schedule hydration reminder
     */
    public function scheduleHydration(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'interval_minutes' => 'required|integer|min:30|max:480', // 30 minutes to 8 hours
            'amount_ml' => 'nullable|integer|min:50|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = $request->user();
        $intervalMinutes = $request->interval_minutes;
        $amountMl = $request->amount_ml ?? 200;
        
        $scheduledTime = Carbon::now()->addMinutes($intervalMinutes);

        $notification = NotificationModel::create([
            'user_id' => $user->id,
            'type' => 'hydration',
            'title' => 'Time to hydrate',
            'body' => "{$amountMl}ml suggested to stay hydrated",
            'scheduled_time' => $scheduledTime,
            'status' => 'scheduled',
            'data' => json_encode([
                'amount' => $amountMl,
                'interval_minutes' => $intervalMinutes,
            ]),
        ]);

        return response()->json($notification, 201);
    }

    /**
     * Schedule medication reminder
     */
    public function scheduleMedication(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'medication_id' => 'required|integer|exists:medications,id',
            'medication_name' => 'required|string|max:255',
            'scheduled_time' => 'required|date',
            'dosage' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = $request->user();
        $medicationName = $request->medication_name;
        $dosage = $request->dosage;
        $scheduledTime = Carbon::parse($request->scheduled_time);
        
        $title = $dosage ? "Take {$dosage} {$medicationName}" : "Take {$medicationName}";
        $body = "Time for your medication at " . $scheduledTime->format('g:i A');

        $notification = NotificationModel::create([
            'user_id' => $user->id,
            'type' => 'medication',
            'title' => $title,
            'body' => $body,
            'scheduled_time' => $scheduledTime,
            'status' => 'scheduled',
            'data' => json_encode([
                'medication_id' => $request->medication_id,
                'medication_name' => $medicationName,
                'dosage' => $dosage,
                'scheduled_time' => $request->scheduled_time,
            ]),
        ]);

        return response()->json($notification, 201);
    }

    /**
     * Snooze a notification
     */
    public function snooze(Request $request, $id)
    {
        $validator = Validator::make($request->all(), [
            'minutes' => 'required|integer|min:5|max:120',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = $request->user();
        $minutes = $request->minutes;
        
        $notification = NotificationModel::where('id', $id)
            ->where('user_id', $user->id)
            ->first();

        if (!$notification) {
            return response()->json(['error' => 'Notification not found'], 404);
        }

        $newScheduledTime = Carbon::now()->addMinutes($minutes);
        
        $updateData = [
            'scheduled_time' => $newScheduledTime,
            'status' => 'snoozed',
        ];
        if (Schema::hasColumn('notifications', 'opened_at')) {
            $updateData['opened_at'] = Carbon::now();
        }

        try {
            $notification->update($updateData);
        } catch (\Throwable $e) {
            $updateData['status'] = 'scheduled';
            $notification->update($updateData);
        }

        return response()->json($notification);
    }

    /**
     * Mark notification as completed
     */
    public function complete(Request $request, $id)
    {
        $user = $request->user();
        
        $notification = NotificationModel::where('id', $id)
            ->where('user_id', $user->id)
            ->first();

        if (!$notification) {
            return response()->json(['error' => 'Notification not found'], 404);
        }

        $notification->update([
            'status' => 'completed',
            'completed_at' => Carbon::now(),
        ]);

        // If it's a hydration reminder, schedule the next one
        if ($notification->type === 'hydration') {
            $data = is_array($notification->data) ? $notification->data : json_decode($notification->data ?? '{}', true);
            $intervalMinutes = $data['interval_minutes'] ?? 120;
            
            $nextScheduledTime = Carbon::now()->addMinutes($intervalMinutes);
            
            NotificationModel::create([
                'user_id' => $user->id,
                'type' => 'hydration',
                'title' => 'Time to hydrate',
                'body' => ($data['amount'] ?? 200) . "ml suggested to stay hydrated",
                'scheduled_time' => $nextScheduledTime,
                'status' => 'scheduled',
                'data' => $notification->data,
            ]);
        }

        return response()->json($notification);
    }

    /**
     * Mark missed notifications (called by cron job or background task)
     */
    public function markMissedNotifications()
    {
        $missedThreshold = 30; // minutes
        
        $missedNotifications = NotificationModel::where('status', 'scheduled')
            ->where('scheduled_time', '<', Carbon::now()->subMinutes($missedThreshold))
            ->get();

        foreach ($missedNotifications as $notification) {
            $notification->update([
                'status' => 'missed',
                'missed_at' => Carbon::now(),
            ]);
        }

        return response()->json([
            'message' => 'Marked ' . $missedNotifications->count() . ' notifications as missed'
        ]);
    }

    /**
     * Get today's timeline (notifications for today)
     */
    public function getTodayTimeline(Request $request)
    {
        $user = $request->user();
        
        $today = Carbon::today();
        
        $notifications = NotificationModel::where('user_id', $user->id)
            ->whereDate('scheduled_time', $today)
            ->orderBy('scheduled_time', 'asc')
            ->get()
            ->map(function ($notification) {
                $statusEmoji = match($notification->status) {
                    'completed' => '✅',
                    'scheduled' => '⏳',
                    'missed' => '❌',
                    default => '📋',
                };
                
                $statusText = match($notification->status) {
                    'completed' => 'completed',
                    'scheduled' => 'upcoming',
                    'missed' => 'skipped',
                    default => $notification->status,
                };
                
                return [
                    'id' => $notification->id,
                    'time' => Carbon::parse($notification->scheduled_time)->format('g:i A'),
                    'title' => $notification->title,
                    'body' => $notification->body,
                    'type' => $notification->type,
                    'status' => $notification->status,
                    'status_text' => $statusText,
                    'status_emoji' => $statusEmoji,
                    'scheduled_time' => $notification->scheduled_time,
                ];
            });

        return response()->json($notifications);
    }

    /**
     * Get notification statistics
     */
    public function getStats(Request $request)
    {
        $user = $request->user();
        $today = Carbon::today();
        $tomorrow = Carbon::tomorrow();
        $now = Carbon::now();

        $notifications = NotificationModel::where('user_id', $user->id)
            ->where('status', '!=', 'cleared');

        $todayNotifications = (clone $notifications)
            ->whereBetween('scheduled_time', [$today, $tomorrow])
            ->get();

        $scheduledToday = $todayNotifications
            ->whereIn('status', ['scheduled', 'upcoming'])
            ->filter(fn ($notification) => Carbon::parse($notification->scheduled_time)->gt($now))
            ->count();

        $alerts = (clone $notifications)
            ->whereIn('status', ['missed', 'skipped', 'failed', 'needs_attention'])
            ->count();

        $completed = (clone $notifications)
            ->where('status', 'completed')
            ->count();

        $unreadQuery = (clone $notifications);
        if (Schema::hasColumn('notifications', 'opened_at')) {
            $unreadQuery->whereNull('opened_at');
        } elseif (Schema::hasColumn('notifications', 'read_at')) {
            $unreadQuery->whereNull('read_at');
        }

        $stats = [
            'unread' => $unreadQuery->count(),
            'scheduled_today' => $scheduledToday,
            'alerts' => $alerts,
            'by_type' => [
                'hydration' => (clone $notifications)->where('type', 'hydration')->count(),
                'medication' => (clone $notifications)->where('type', 'medication')->count(),
                'general' => (clone $notifications)->where('type', 'general')->count(),
            ],
            'done_today' => $completed,
            'due_later' => $scheduledToday,
            'needs_attention' => $alerts,
            'completed' => $completed,
            'upcoming' => $scheduledToday,
            'missed' => $alerts,
        ];

        return response()->json($stats);
    }

    /**
     * Get admin statistics for notification management
     */
    public function getAdminStats(Request $request)
    {
        $days = (int) $request->query('days', 30);
        if (!in_array($days, [7, 30, 90])) {
            $days = 30;
        }

        try {
            $startDate = now()->subDays($days);
            
            // Get notification counts
            $totalNotifications = NotificationModel::where('created_at', '>=', $startDate)->count();
            $deliveredCount = NotificationModel::where('created_at', '>=', $startDate)
                ->where('status', 'delivered')
                ->count();
            $snoozedCount = NotificationModel::where('created_at', '>=', $startDate)
                ->where('status', 'snoozed')
                ->count();
            $missedCount = NotificationModel::where('created_at', '>=', $startDate)
                ->where('status', 'missed')
                ->count();
            $pendingCount = NotificationModel::where('created_at', '>=', $startDate)
                ->where('status', 'scheduled')
                ->count();
            
            // Count by type
            $hydrationCount = NotificationModel::where('created_at', '>=', $startDate)
                ->where('type', 'hydration')
                ->count();
            $medicationCount = NotificationModel::where('created_at', '>=', $startDate)
                ->where('type', 'medication')
                ->count();
            
            // Daily volume
            $dailyVolume = [];
            for ($i = $days - 1; $i >= 0; $i--) {
                $date = now()->subDays($i)->format('Y-m-d');
                $count = NotificationModel::whereDate('created_at', $date)->count();
                
                $dailyVolume[] = [
                    'date' => $date,
                    'count' => $count
                ];
            }
            
            // Response times (average time between scheduled and completed)
            $responseTimes = [];
            for ($i = $days - 1; $i >= 0; $i--) {
                $date = now()->subDays($i)->format('Y-m-d');
                
                $notifications = NotificationModel::whereDate('created_at', $date)
                    ->where('status', 'completed')
                    ->whereNotNull('completed_at')
                    ->get();
                
                $avgResponseTime = 0;
                if ($notifications->count() > 0) {
                    $totalMinutes = 0;
                    foreach ($notifications as $notification) {
                        $scheduled = Carbon::parse($notification->scheduled_time);
                        $completed = Carbon::parse($notification->completed_at);
                        $totalMinutes += $completed->diffInMinutes($scheduled);
                    }
                    $avgResponseTime = round($totalMinutes / $notifications->count(), 1);
                }
                
                $responseTimes[] = [
                    'date' => $date,
                    'avg_response_time' => $avgResponseTime
                ];
            }
            
            // Recent notifications
            $recentNotifications = NotificationModel::with('user')
                ->orderBy('created_at', 'desc')
                ->limit(10)
                ->get()
                ->map(function ($notification) {
                    $responseTime = null;
                    if ($notification->status === 'completed' && $notification->completed_at) {
                        $scheduled = Carbon::parse($notification->scheduled_time);
                        $completed = Carbon::parse($notification->completed_at);
                        $responseTime = $completed->diffInMinutes($scheduled);
                    }
                    
                    return [
                        'user_name' => $notification->user->name ?? 'Unknown User',
                        'type' => $notification->type,
                        'title' => $notification->title,
                        'status' => $notification->status,
                        'scheduled_at' => $notification->scheduled_time,
                        'response_time' => $responseTime
                    ];
                });

            return response()->json([
                'total_notifications' => $totalNotifications,
                'delivered_count' => $deliveredCount,
                'snoozed_count' => $snoozedCount,
                'missed_count' => $missedCount,
                'pending_count' => $pendingCount,
                'hydration_count' => $hydrationCount,
                'medication_count' => $medicationCount,
                'daily_volume' => $dailyVolume,
                'response_times' => $responseTimes,
                'recent_notifications' => $recentNotifications
            ]);

        } catch (\Exception $e) {
            \Log::error('Notification admin stats error', ['error' => $e->getMessage()]);
            return response()->json([
                'total_notifications' => 0,
                'delivered_count' => 0,
                'snoozed_count' => 0,
                'missed_count' => 0,
                'pending_count' => 0,
                'hydration_count' => 0,
                'medication_count' => 0,
                'daily_volume' => [],
                'response_times' => [],
                'recent_notifications' => []
            ], 500);
        }
    }
}
