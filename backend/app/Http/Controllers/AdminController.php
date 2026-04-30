<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use App\Models\HydrationEntry;
use App\Models\Medication;
use App\Models\MedicationHistory;
use App\Models\Notification;
use App\Models\UserActivityLog;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Carbon\Carbon;
use App\Mail\AdminPasswordResetMail;
use App\Mail\UserPasswordResetMail;

class AdminController extends Controller
{
    public function showLoginForm()
    {
        return view('admin.login');
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        if (Auth::attempt($credentials)) {
            $user = Auth::user();

            if ($user->role !== 'admin') {
                Auth::logout();
                return back()->withErrors(['email' => 'Access denied. Admin privileges required.']);
            }

            $request->session()->regenerate();
            return redirect()->intended(route('admin.dashboard'));
        }

        return back()->withErrors(['email' => 'Invalid credentials.']);
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('admin.login')->with('status', 'Logged out successfully');
    }

    // ===== PASSWORD RESET METHODS =====

    /**
     * Show the forgot password form
     */
    public function showForgotPasswordForm()
    {
        return view('admin.forgot-password');
    }

    /**
     * Send password reset link to admin email
     */
    public function sendResetLink(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $email = $request->email;

        // Check if user exists and is an admin (security: don't reveal if email exists)
        $user = User::where('email', $email)->where('role', 'admin')->first();

        // Always show success message to prevent email enumeration
        if (!$user) {
            return back()->with('status', 'If that email exists in our system, we have sent a password reset link.');
        }

        // Check for rate limiting - prevent abuse (max 3 requests per hour per email)
        $recentRequests = DB::table('password_reset_tokens')
            ->where('email', $email)
            ->where('created_at', '>', Carbon::now()->subHour())
            ->count();

        if ($recentRequests >= 3) {
            return back()->with('status', 'Too many password reset attempts. Please try again later.');
        }

        // Generate secure token
        $token = Str::random(64);

        // Delete any existing tokens for this email
        DB::table('password_reset_tokens')->where('email', $email)->delete();

        // Store hashed token in database
        DB::table('password_reset_tokens')->insert([
            'email' => $email,
            'token' => Hash::make($token),
            'created_at' => Carbon::now(),
        ]);

        // Generate reset URL with token
        $resetUrl = url(route('admin.password.reset', [
            'token' => $token,
            'email' => $email
        ], false));

        // Send email
        try {
            Mail::to($email)->send(new AdminPasswordResetMail($resetUrl, $email, 60));
        } catch (\Exception $e) {
            // Log error but don't reveal to user
            Log::error('Password reset email failed: ' . $e->getMessage());
        }

        return back()->with('status', 'If that email exists in our system, we have sent a password reset link.');
    }

    /**
     * Show the password reset form
     */
    public function showResetPasswordForm(Request $request, $token)
    {
        $email = $request->query('email');

        return view('admin.reset-password', [
            'token' => $token,
            'email' => $email
        ]);
    }

    /**
     * Reset the admin password
     */
    public function resetPassword(Request $request)
    {
        $request->validate([
            'token' => 'required',
            'email' => 'required|email',
            'password' => 'required|min:8|confirmed',
        ]);

        $email = $request->email;
        $token = $request->token;
        $password = $request->password;

        // Find the password reset token
        $resetRecord = DB::table('password_reset_tokens')
            ->where('email', $email)
            ->first();

        // Validate token exists
        if (!$resetRecord) {
            return back()->withErrors(['email' => 'Invalid or expired password reset token.']);
        }

        // Check token expiration (60 minutes)
        $tokenAge = Carbon::parse($resetRecord->created_at)->diffInMinutes(Carbon::now());
        if ($tokenAge > 60) {
            DB::table('password_reset_tokens')->where('email', $email)->delete();
            return back()->withErrors(['email' => 'This password reset link has expired. Please request a new one.']);
        }

        // Verify token matches
        if (!Hash::check($token, $resetRecord->token)) {
            return back()->withErrors(['email' => 'Invalid password reset token.']);
        }

        // Find the admin user
        $user = User::where('email', $email)->where('role', 'admin')->first();

        if (!$user) {
            return back()->withErrors(['email' => 'Admin account not found.']);
        }

        // Update password
        $user->password = Hash::make($password);
        $user->save();

        // Delete the used token
        DB::table('password_reset_tokens')->where('email', $email)->delete();

        // Log the user out of all sessions for security
        DB::table('sessions')->where('user_id', $user->id)->delete();

        return redirect()->route('admin.login')->with('status', 'Password reset successful! Please login with your new password.');
    }

    // ===== END PASSWORD RESET METHODS =====

    public function dashboard()
    {
        $users = User::where('role', '!=', 'admin')
            ->latest('created_at')
            ->take(5)
            ->get();

        $totalUsers = User::where('role', '!=', 'admin')->count();

        $dau = User::where('role', '!=', 'admin')
            ->where(function ($query) {
                $query->whereDate('last_login_at', Carbon::today())
                    ->orWhereDate('last_sync_at', Carbon::today())
                    ->orWhereHas('hydrationEntries', fn($entryQuery) => $entryQuery->whereDate('created_at', Carbon::today()))
                    ->orWhereHas('medicationHistory', fn($historyQuery) => $historyQuery->whereDate('created_at', Carbon::today()));
            })
            ->count();

        $usersLast30Days = User::where('role', '!=', 'admin')
            ->where('created_at', '>=', Carbon::now()->subDays(30))
            ->count();
        $usersPrevious30Days = User::where('role', '!=', 'admin')
            ->whereBetween('created_at', [Carbon::now()->subDays(60), Carbon::now()->subDays(30)])
            ->count();
        $userGrowthChange = $usersPrevious30Days > 0
            ? round((($usersLast30Days - $usersPrevious30Days) / $usersPrevious30Days) * 100, 1)
            : ($usersLast30Days > 0 ? 100 : 0);

        $userGrowth = [];
        for ($i = 29; $i >= 0; $i--) {
            $date = Carbon::now()->subDays($i);
            $count = User::where('role', '!=', 'admin')
                ->whereDate('created_at', '<=', $date)
                ->count();
            $userGrowth[] = [
                'date' => $date->format('M j'),
                'users' => $count
            ];
        }

        $hydrationStats = [];
        for ($i = 29; $i >= 0; $i--) {
            $date = Carbon::now()->subDays($i);
            $totalAmount = HydrationEntry::whereDate('created_at', $date)
                ->sum('amount_ml');
            $entryCount = HydrationEntry::whereDate('created_at', $date)->count();
            $average = $entryCount > 0 ? round($totalAmount / $entryCount, 0) : 0;

            $hydrationStats[] = [
                'date' => $date->format('M j'),
                'average' => $average
            ];
        }

        $platformSplit = [
            ['platform' => 'Android', 'count' => $totalUsers]
        ];

        $recentActivityFeed = $this->getRecentActivityFeed(15);
        $systemHealth = $this->getSystemHealth();
        $hydrationCompliance = $this->getHydrationCompliance(7);
        $notificationEffectiveness = $this->getNotificationEffectiveness();
        $atRiskUsersCount = $this->getAtRiskHydrationUsers()->count();

        return view('admin.dashboard-enhanced', compact(
            'users',
            'totalUsers',
            'dau',
            'userGrowth',
            'hydrationStats',
            'platformSplit',
            'usersLast30Days',
            'userGrowthChange',
            'recentActivityFeed',
            'systemHealth',
            'hydrationCompliance',
            'notificationEffectiveness',
            'atRiskUsersCount'
        ));
    }

    public function createUser()
    {
        return view('admin.users.create');
    }

    // Users index (list) - dedicated users page
    public function index()
    {
        $users = User::paginate(10);
        return view('admin.users.index', compact('users'));
    }

    public function showUser(User $user)
    {
        // Get user's health data
        $hydrationEntries = HydrationEntry::where('user_id', $user->id)
            ->orderBy('created_at', 'desc')
            ->limit(10)
            ->get();

        $medications = Medication::where('user_id', $user->id)
            ->where('active', true)
            ->get();

        $medicationHistory = MedicationHistory::where('user_id', $user->id)
            ->orderBy('scheduled_time', 'desc')
            ->limit(10)
            ->get();

        $notifications = Notification::where('user_id', $user->id)
            ->orderBy('created_at', 'desc')
            ->limit(10)
            ->get();

        // Calculate stats
        $totalHydrationEntries = HydrationEntry::where('user_id', $user->id)->count();
        $totalMedicationEntries = MedicationHistory::where('user_id', $user->id)->count();
        $totalNotifications = Notification::where('user_id', $user->id)->count();

        // Get recent activity (last 7 days)
        $recentActivity = HydrationEntry::where('user_id', $user->id)
            ->where('created_at', '>=', Carbon::now()->subDays(7))
            ->count();

        return view('admin.users.show', compact(
            'user',
            'hydrationEntries',
            'medications',
            'medicationHistory',
            'notifications',
            'totalHydrationEntries',
            'totalMedicationEntries',
            'totalNotifications',
            'recentActivity'
        ));
    }

    public function storeUser(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:6|confirmed',
            'role' => 'required|in:user,admin',
        ]);

        $validated['password'] = Hash::make($validated['password']);

        User::create($validated);

        return redirect()->route('admin.dashboard')->with('success', 'User created successfully');
    }

    public function editUser(User $user)
    {
        // Get activity logs
        $activityLogs = $user->activityLogs()->orderBy('created_at', 'desc')->limit(10)->get();

        // Get last login info
        $lastLogin = $user->activityLogs()
            ->where('activity_type', 'login')
            ->orderBy('created_at', 'desc')
            ->first();

        return view('admin.users.edit', compact(
            'user',
            'activityLogs',
            'lastLogin'
        ));
    }

    public function updateUser(Request $request, User $user)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => ['required', 'email', Rule::unique('users')->ignore($user->id)],
            'role' => 'required|in:user,admin',
            'status' => 'required|in:active,suspended,banned,unverified',
            'medical_history' => 'nullable|string',
        ]);

        $user->update($validated);

        return redirect()->route('admin.users.edit', $user)->with('success', 'User updated successfully');
    }

    public function deleteUser(User $user)
    {
        // Prevent admin from deleting themselves
        if ($user->id === Auth::id()) {
            return back()->with('error', 'You cannot delete your own account');
        }

        // Log the deletion
        Log::info('User deleted by admin', [
            'deleted_user_id' => $user->id,
            'deleted_user_email' => $user->email,
            'deleted_by_admin_id' => Auth::id(),
            'deleted_at' => now(),
        ]);

        $user->delete();
        return redirect()->route('admin.users.index')->with('success', 'User deleted successfully');
    }

    // ===== USER STATUS AND PASSWORD RESET METHODS =====

    /**
     * Send password reset email to user
     */
    public function sendPasswordResetEmail(Request $request, User $user)
    {
        $request->validate([
            'reset_token' => 'required|string',
        ]);

        try {
            // Generate secure token
            $token = Str::random(64);

            // Delete any existing tokens for this user
            DB::table('password_reset_tokens')->where('email', $user->email)->delete();

            // Store hashed token in database
            DB::table('password_reset_tokens')->insert([
                'email' => $user->email,
                'token' => Hash::make($token),
                'created_at' => Carbon::now(),
            ]);

            // Generate reset URL
            $resetUrl = url(route('password.reset', [
                'token' => $token,
                'email' => $user->email
            ], false));

            // Send email
            Mail::to($user->email)->send(new UserPasswordResetMail($resetUrl, $user->name, 60));

            return back()->with('success', 'Password reset email sent to ' . $user->email);
        } catch (\Exception $e) {
            Log::error('Password reset email failed for user ' . $user->id . ': ' . $e->getMessage());
            return back()->with('error', 'Failed to send password reset email. Please try again.');
        }
    }

    /**
     * Update user status
     */
    public function updateStatus(Request $request, User $user)
    {
        $validated = $request->validate([
            'status' => 'required|in:active,suspended,banned,unverified',
        ]);

        $oldStatus = $user->status;
        $user->update($validated);

        // Log status change
        UserActivityLog::create([
            'user_id' => $user->id,
            'activity_type' => 'status_change',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => "Status changed from {$oldStatus} to {$validated['status']} by admin",
        ]);

        return back()->with('success', 'User status updated to ' . $validated['status']);
    }

    /**
     * Get user activity log
     */
    public function getActivityLog(User $user)
    {
        $activityLogs = $user->activityLogs()
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return view('admin.users.activity-log', compact('user', 'activityLogs'));
    }

    // Health module management methods
    public function hydration()
    {
        $timeRange = request('timeRange', 7);
        $userType = request('userType', 'all');

        $totalUsers = User::where('role', '!=', 'admin')
            ->where('status', 'active')
            ->count();

        $dailyUserIntake = HydrationEntry::select('user_id', DB::raw('DATE(created_at) as intake_date'), DB::raw('SUM(amount_ml) as daily_total'))
            ->where('created_at', '>=', Carbon::now()->subDays($timeRange))
            ->groupBy('user_id', DB::raw('DATE(created_at)'))
            ->get();

        $avgDailyIntake = $dailyUserIntake->isNotEmpty() ? round($dailyUserIntake->avg('daily_total'), 0) : 0;

        $compliance = $this->getHydrationCompliance($timeRange);
        $goalAchievement = $compliance['compliance_rate'];

        $atRiskUsers = $this->getAtRiskHydrationUsers();

        $averageGoal = User::where('role', '!=', 'admin')
            ->where('status', 'active')
            ->avg('hydration_goal') ?: 2000;

        $chartData = [];
        for ($i = ($timeRange - 1); $i >= 0; $i--) {
            $date = Carbon::now()->subDays($i);
            $totalIntake = HydrationEntry::whereDate('created_at', $date)
                ->sum('amount_ml');
            $entryCount = HydrationEntry::whereDate('created_at', $date)->count();
            $avgIntake = $entryCount > 0 ? round($totalIntake / $entryCount, 0) : 0;

            $chartData[] = [
                'date' => $date->format('M j'),
                'actual' => $avgIntake,
                'goal' => round($averageGoal, 0)
            ];
        }

        $lowIntakeEntries = $this->getLowHydrationEntries($timeRange);

        return view('admin.hydration.index-enhanced', compact(
            'totalUsers',
            'avgDailyIntake',
            'goalAchievement',
            'atRiskUsers',
            'chartData',
            'lowIntakeEntries',
            'timeRange',
            'userType'
        ));
    }

    public function medication()
    {
        $timeRange = request('timeRange', 7);
        $since = Carbon::now()->subDays($timeRange);

        // Calculate metrics
        $activeMedications = Medication::where('active', true)->count();

        $historyEntries = $this->dedupeMedicationHistoryCollection(
            MedicationHistory::where('created_at', '>=', $since)
                ->with('user', 'medication')
                ->get()
        );
        $totalEntries = $historyEntries->count();
        $completedEntries = $historyEntries->where('status', 'completed')->count();
        $adherenceRate = $totalEntries > 0 ? round(($completedEntries / $totalEntries) * 100, 1) : 0;

        $missedDoses = $historyEntries->whereIn('status', ['missed', 'skipped'])->count();

        // Get critical missed medications
        $criticalMissedMedications = $this->getCriticalMissedMedications();

        // Get medication compliance ranking
        $complianceRanking = $this->getMedicationComplianceRanking();

        $medicationTypeData = $this->getMedicationAdherenceByName($timeRange);
        $weeklyAdherenceData = $this->getMedicationAdherenceTrend($timeRange);

        $problematicEntries = $historyEntries
            ->whereIn('status', ['missed', 'skipped'])
            ->sortByDesc(fn($entry) => optional($entry->created_at)->timestamp ?? 0)
            ->take(10)
            ->values();

        return view('admin.medication.index-enhanced', compact(
            'activeMedications',
            'adherenceRate',
            'missedDoses',
            'criticalMissedMedications',
            'complianceRanking',
            'medicationTypeData',
            'weeklyAdherenceData',
            'problematicEntries',
            'timeRange'
        ));
    }

    public function notifications()
    {
        $timeRange = request('timeRange', 7);

        // Calculate metrics
        $totalNotifications = Notification::where('created_at', '>=', Carbon::now()->subDays($timeRange))->count();

        $deliveredNotifications = Notification::where('status', 'delivered')
            ->where('created_at', '>=', Carbon::now()->subDays($timeRange))
            ->count();

        $openedNotifications = Notification::whereNotNull('opened_at')
            ->where('created_at', '>=', Carbon::now()->subDays($timeRange))
            ->count();

        $openRate = $totalNotifications > 0 ? round(($openedNotifications / $totalNotifications) * 100, 1) : 0;

        $effectiveness = $this->getNotificationEffectiveness($timeRange);
        $effectivenessRate = $effectiveness['rate'];
        $avgResponseMinutes = $this->getNotificationAverageResponseMinutes($timeRange);
        $notificationVolumeData = $this->getNotificationVolumeData($timeRange);
        $notificationTypeData = $this->getNotificationTypeData($timeRange);
        $engagementBreakdown = $this->getNotificationEngagementBreakdown($timeRange);

        // Get additional metrics
        $snoozedCount = Notification::where('status', 'snoozed')
            ->where('created_at', '>=', Carbon::now()->subDays($timeRange))
            ->count();

        $failedCount = Notification::where('status', 'failed')
            ->where('created_at', '>=', Carbon::now()->subDays($timeRange))
            ->count();

        // Get failed notifications
        $failedNotifications = $this->getFailedNotifications(10);

        // Get recent notifications with interaction status
        $recentNotifications = Notification::where('created_at', '>=', Carbon::now()->subDays($timeRange))
            ->with('user')
            ->latest('created_at')
            ->limit(15)
            ->get()
            ->map(function ($notif) {
                $status = 'Not Opened';
                if ($notif->opened_at) {
                    $status = 'Opened Only';
                    if ($notif->actioned_at) {
                        $status = 'Opened & Actioned';
                    }
                }
                return [
                    'id' => $notif->id,
                    'user_id' => $notif->user_id,
                    'user_name' => $notif->user->name,
                    'message' => $notif->body,
                    'type' => $notif->type ?? 'General',
                    'status' => $notif->status,
                    'user_interaction' => $status,
                    'created_at' => $notif->created_at,
                ];
            });

        return view('admin.notifications.index-enhanced', compact(
            'totalNotifications',
            'deliveredNotifications',
            'openRate',
            'effectivenessRate',
            'avgResponseMinutes',
            'notificationVolumeData',
            'notificationTypeData',
            'engagementBreakdown',
            'snoozedCount',
            'failedCount',
            'failedNotifications',
            'recentNotifications',
            'timeRange'
        ));
    }

    public function getDashboardStats()
    {
        try {
            // Get basic counts
            $activeHydrationUsers = HydrationEntry::where('created_at', '>=', Carbon::now()->subDays(7))
                ->distinct('user_id')
                ->count('user_id');

            $activeMedications = Medication::where('reminder', true)->count();
            $notificationsSent = Notification::count();

            // Get hydration entries count
            $hydrationEntries = HydrationEntry::count();

            // Get medication entries count
            $medicationEntries = MedicationHistory::count();

            // Get user activity for last 7 days
            $userActivity = [];
            for ($i = 6; $i >= 0; $i--) {
                $date = Carbon::now()->subDays($i)->format('Y-m-d');
                $activeUsers = HydrationEntry::whereDate('created_at', $date)
                    ->distinct('user_id')
                    ->count('user_id');

                $userActivity[] = [
                    'date' => Carbon::now()->subDays($i)->format('M j'),
                    'active_users' => $activeUsers
                ];
            }

            return response()->json([
                'active_hydration_users' => $activeHydrationUsers,
                'active_medications' => $activeMedications,
                'notifications_sent' => $notificationsSent,
                'hydration_entries' => $hydrationEntries,
                'medication_entries' => $medicationEntries,
                'user_activity' => $userActivity
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'active_hydration_users' => 0,
                'active_medications' => 0,
                'notifications_sent' => 0,
                'hydration_entries' => 0,
                'medication_entries' => 0,
                'user_activity' => []
            ], 500);
        }
    }

    // ===== ENHANCED DASHBOARD DATA METHODS =====

    /**
     * Get recent system activity feed
     */
    public function getRecentActivityFeed($limit = 15)
    {
        $activities = [];

        // Recent registrations
        $recentUsers = User::where('created_at', '>=', Carbon::now()->subDays(7))
            ->latest('created_at')
            ->limit(5)
            ->get(['id', 'name', 'email', 'created_at'])
            ->map(fn($user) => [
                'type' => 'registration',
                'title' => 'New User Registration',
                'description' => $user->name . ' (' . $user->email . ')',
                'timestamp' => $user->created_at,
                'icon' => 'user-plus',
                'color' => 'blue'
            ]);

        // Missed medication alerts
        $missedMeds = $this->dedupeMedicationHistoryCollection(
            MedicationHistory::whereIn('status', ['missed', 'skipped'])
                ->where('created_at', '>=', Carbon::now()->subDays(1))
                ->with('user', 'medication')
                ->latest('created_at')
                ->get()
        )
            ->whereIn('status', ['missed', 'skipped'])
            ->sortByDesc(fn($med) => optional($med->created_at)->timestamp ?? 0)
            ->take(5)
            ->map(fn($med) => [
                'type' => 'missed_medication',
                'title' => 'Missed Medication Alert',
                'description' => $med->user->name . ' missed ' . $med->medication->name,
                'timestamp' => $med->created_at,
                'icon' => 'alert-circle',
                'color' => 'red'
            ]);

        $activities = collect(array_merge($recentUsers->toArray(), $missedMeds->toArray()))
            ->sortByDesc('timestamp')
            ->take($limit);

        return $activities;
    }

    /**
     * Get system health status
     */
    public function getSystemHealth()
    {
        return [
            'email_service' => $this->checkEmailService(),
            'database' => $this->checkDatabase(),
            'password_resets' => $this->getPasswordResetTokenCount(),
        ];
    }

    private function checkEmailService()
    {
        $mailer = config('mail.default');

        if (!$mailer) {
            return [
                'status' => 'error',
                'message' => 'No default mailer configured',
                'color' => 'red'
            ];
        }

        return [
            'status' => 'configured',
            'message' => ucfirst($mailer) . ' mailer configured',
            'color' => 'green'
        ];
    }

    private function checkDatabase()
    {
        try {
            DB::connection()->getPdo();
            return [
                'status' => 'operational',
                'message' => 'Database connection healthy',
                'color' => 'green'
            ];
        } catch (\Exception $e) {
            return [
                'status' => 'error',
                'message' => 'Database connection failed',
                'color' => 'red'
            ];
        }
    }

    private function getPasswordResetTokenCount()
    {
        return DB::table('password_reset_tokens')
            ->where('created_at', '>=', Carbon::now()->subHour())
            ->count();
    }

    /**
     * Get at-risk hydration users (below 50% goal in past week)
     */
    public function getAtRiskHydrationUsers()
    {
        $weekAgo = Carbon::now()->subDays(7);

        $users = User::with('hydrationEntries')
            ->where('status', 'active')
            ->get()
            ->filter(function ($user) use ($weekAgo) {
                $entries = $user->hydrationEntries()
                    ->where('created_at', '>=', $weekAgo)
                    ->get();

                if ($entries->isEmpty()) return false;

                $totalIntake = $entries->sum('amount_ml');
                $goalDays = $entries->groupBy('created_at:Y-m-d')->count();
                $expectedTotal = ($user->hydration_goal ?? 2000) * $goalDays;

                return $totalIntake < ($expectedTotal * 0.5);
            })
            ->map(function ($user) use ($weekAgo) {
                $entries = $user->hydrationEntries()
                    ->where('created_at', '>=', $weekAgo)
                    ->get();
                $totalIntake = $entries->sum('amount_ml');
                $goalDays = $entries->groupBy('created_at:Y-m-d')->count();
                $expectedTotal = ($user->hydration_goal ?? 2000) * $goalDays;

                return [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'goal' => $user->hydration_goal ?? 2000,
                    'intake' => $totalIntake,
                    'percentage' => round(($totalIntake / $expectedTotal) * 100, 1),
                    'days_logged' => $goalDays,
                ];
            })
            ->sortBy('percentage')
            ->take(10);

        return $users;
    }

    /**
     * Get critical missed medications (users missing repeatedly)
     */
    public function getCriticalMissedMedications()
    {
        $weekAgo = Carbon::now()->subDays(7);

        $missedEntries = $this->dedupeMedicationHistoryCollection(
            MedicationHistory::whereIn('status', ['missed', 'skipped'])
                ->where('created_at', '>=', $weekAgo)
                ->with('user', 'medication')
                ->get()
        )->whereIn('status', ['missed', 'skipped']);

        return $missedEntries
            ->groupBy('user_id')
            ->map(function ($entries, $userId) {
                $user = $entries->first()->user ?? User::find($userId);
                if (!$user || $entries->count() <= 2) {
                    return null;
                }

                return [
                    'user_id' => $user->id,
                    'user_name' => $user->name,
                    'user_email' => $user->email,
                    'missed_count' => $entries->count(),
                    'medications' => $entries->pluck('medication.name')->filter()->unique()->implode(', '),
                ];
            })
            ->filter()
            ->values();
    }

    private function medicationHistoryDoseTime(MedicationHistory $entry): Carbon
    {
        $source = $entry->scheduled_time ?: $entry->time ?: $entry->created_at;
        return Carbon::parse($source)->seconds(0)->microseconds(0);
    }

    private function medicationHistoryDoseKey(MedicationHistory $entry): string
    {
        return implode('|', [
            $entry->user_id,
            $entry->medication_id,
            $this->medicationHistoryDoseTime($entry)->format('Y-m-d H:i'),
        ]);
    }

    private function medicationHistoryStatusPriority(?string $status): int
    {
        return match ($status) {
            'completed' => 4,
            'snoozed' => 3,
            'missed', 'skipped' => 2,
            default => 1,
        };
    }

    private function dedupeMedicationHistoryCollection($entries)
    {
        return collect($entries)
            ->reduce(function ($deduped, MedicationHistory $entry) {
                $key = $this->medicationHistoryDoseKey($entry);
                $existing = $deduped->get($key);
                if (!$existing) {
                    $deduped->put($key, $entry);
                    return $deduped;
                }

                $entryPriority = $this->medicationHistoryStatusPriority($entry->status);
                $existingPriority = $this->medicationHistoryStatusPriority($existing->status);
                $entryStamp = optional($entry->created_at)->timestamp ?? 0;
                $existingStamp = optional($existing->created_at)->timestamp ?? 0;

                if ($entryPriority > $existingPriority || ($entryPriority === $existingPriority && $entryStamp > $existingStamp)) {
                    $deduped->put($key, $entry);
                }

                return $deduped;
            }, collect())
            ->values();
    }

    /**
     * Get notification effectiveness metrics
     */
    public function getNotificationEffectiveness($days = null)
    {
        $baseQuery = Notification::query();
        if ($days !== null) {
            $baseQuery->where('created_at', '>=', Carbon::now()->subDays($days));
        }

        $totalNotifications = (clone $baseQuery)->count();
        $engagedNotifications = (clone $baseQuery)->whereNotNull('actioned_at')->count();

        return [
            'total' => $totalNotifications,
            'engaged' => $engagedNotifications,
            'rate' => $totalNotifications > 0 ? round(($engagedNotifications / $totalNotifications) * 100, 1) : 0,
        ];
    }

    private function getNotificationAverageResponseMinutes($days)
    {
        $notifications = Notification::whereNotNull('opened_at')
            ->whereNotNull('actioned_at')
            ->where('created_at', '>=', Carbon::now()->subDays($days))
            ->get(['opened_at', 'actioned_at']);

        if ($notifications->isEmpty()) {
            return null;
        }

        return round($notifications->avg(fn($notification) => $notification->opened_at->diffInMinutes($notification->actioned_at)), 1);
    }

    private function getNotificationVolumeData($days)
    {
        $data = [];
        for ($i = ($days - 1); $i >= 0; $i--) {
            $date = Carbon::now()->subDays($i);
            $data[] = [
                'date' => $date->format('M j'),
                'count' => Notification::whereDate('created_at', $date)->count(),
            ];
        }

        return $data;
    }

    private function getNotificationTypeData($days)
    {
        return Notification::where('created_at', '>=', Carbon::now()->subDays($days))
            ->pluck('type')
            ->map(fn($type) => trim((string) $type) !== '' ? Str::lower(trim((string) $type)) : 'general')
            ->countBy()
            ->sortDesc()
            ->map(fn($count, $type) => [
                'type' => Str::headline($type),
                'count' => (int) $count,
            ])
            ->values();
    }

    private function getNotificationEngagementBreakdown($days)
    {
        $baseQuery = Notification::where('created_at', '>=', Carbon::now()->subDays($days));
        $total = (clone $baseQuery)->count();
        $actioned = (clone $baseQuery)->whereNotNull('opened_at')->whereNotNull('actioned_at')->count();
        $openedOnly = (clone $baseQuery)->whereNotNull('opened_at')->whereNull('actioned_at')->count();
        $notOpened = max($total - $actioned - $openedOnly, 0);

        return [
            [
                'label' => 'Opened and actioned',
                'count' => $actioned,
                'percent' => $total > 0 ? round(($actioned / $total) * 100, 1) : 0,
                'color' => 'green',
            ],
            [
                'label' => 'Opened only',
                'count' => $openedOnly,
                'percent' => $total > 0 ? round(($openedOnly / $total) * 100, 1) : 0,
                'color' => 'blue',
            ],
            [
                'label' => 'Not opened',
                'count' => $notOpened,
                'percent' => $total > 0 ? round(($notOpened / $total) * 100, 1) : 0,
                'color' => 'slate',
            ],
        ];
    }

    private function getMedicationAdherenceByName($days)
    {
        $entries = $this->dedupeMedicationHistoryCollection(
            MedicationHistory::where('created_at', '>=', Carbon::now()->subDays($days))
                ->with('medication')
                ->get()
        );

        return $entries
            ->groupBy('medication_id')
            ->map(function ($items) {
                $total = $items->count();
                $completed = $items->where('status', 'completed')->count();
                return [
                    'type' => optional($items->first()->medication)->name ?? 'Medication',
                    'adherence' => $total > 0 ? round(($completed / $total) * 100, 1) : 0,
                    'total' => $total,
                ];
            })
            ->sortByDesc('total')
            ->take(8)
            ->map(fn($row) => [
                'type' => $row['type'],
                'adherence' => $row['adherence'],
            ])
            ->values();
    }

    private function getMedicationAdherenceTrend($days)
    {
        $entries = $this->dedupeMedicationHistoryCollection(
            MedicationHistory::where('created_at', '>=', Carbon::now()->subDays($days))
                ->get()
        );
        $data = [];
        for ($i = ($days - 1); $i >= 0; $i--) {
            $date = Carbon::now()->subDays($i);
            $dayEntries = $entries->filter(fn($entry) => $this->medicationHistoryDoseTime($entry)->isSameDay($date));
            $total = $dayEntries->count();
            $completed = $dayEntries->where('status', 'completed')->count();

            $data[] = [
                'date' => $date->format('M j'),
                'adherence' => $total > 0 ? round(($completed / $total) * 100, 1) : 0,
            ];
        }

        return $data;
    }

    /**
     * Get failed notifications with error details
     */
    public function getFailedNotifications($limit = 10)
    {
        return Notification::where('status', 'failed')
            ->with('user')
            ->latest('created_at')
            ->limit($limit)
            ->get()
            ->map(fn($notif) => [
                'id' => $notif->id,
                'user_id' => $notif->user_id,
                'user_name' => $notif->user->name,
                'user_email' => $notif->user->email,
                'message' => $notif->body,
                'error' => $notif->error_message ?? 'Unknown error',
                'created_at' => $notif->created_at,
            ]);
    }

    /**
     * Get user compliance ranking for medications
     */
    public function getMedicationComplianceRanking()
    {
        $weekAgo = Carbon::now()->subDays(7);

        $ranking = User::with(['medicationHistory' => function ($query) use ($weekAgo) {
            $query->where('created_at', '>=', $weekAgo);
        }])
            ->where('status', 'active')
            ->get()
            ->map(function ($user) {
                $history = $this->dedupeMedicationHistoryCollection($user->medicationHistory);
                $total = $history->count();
                if ($total === 0) return null;

                $completed = $history->where('status', 'completed')->count();
                $rate = round(($completed / $total) * 100, 1);

                return [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'adherence_rate' => $rate,
                    'completed' => $completed,
                    'total' => $total,
                ];
            })
            ->filter(fn($user) => $user !== null)
            ->sort(function ($a, $b) {
                return $b['adherence_rate'] <=> $a['adherence_rate'];
            });

        return [
            'top_users' => $ranking->take(5),
            'bottom_users' => $ranking->reverse()->take(5),
        ];
    }

    /**
     * Get hydration compliance summary
     */
    public function getHydrationCompliance($days = 7)
    {
        $startDate = Carbon::now()->subDays($days);
        $users = User::with(['hydrationEntries' => function ($query) use ($startDate) {
            $query->where('created_at', '>=', $startDate);
        }])->where('status', 'active')->get();

        $avgComplianceRate = 0;
        if ($users->count() > 0) {
            $totalRate = $users->sum(function ($user) {
                $entries = $user->hydrationEntries;
                if ($entries->isEmpty()) return 0;

                $totalIntake = $entries->sum('amount_ml');
                $daysLogged = $entries->groupBy('created_at:Y-m-d')->count();
                $expectedTotal = ($user->hydration_goal ?? 2000) * $daysLogged;

                return $expectedTotal > 0 ? ($totalIntake / $expectedTotal) * 100 : 0;
            });
            $avgComplianceRate = round($totalRate / $users->count(), 1);
        }

        return [
            'compliance_rate' => $avgComplianceRate,
            'users_on_track' => $users->sum(function ($user) {
                $entries = $user->hydrationEntries;
                if ($entries->isEmpty()) return 0;

                $totalIntake = $entries->sum('amount_ml');
                $daysLogged = $entries->groupBy('created_at:Y-m-d')->count();
                $expectedTotal = ($user->hydration_goal ?? 2000) * $daysLogged;

                return $expectedTotal > 0 && ($totalIntake / $expectedTotal) >= 0.8 ? 1 : 0;
            }),
            'total_users' => $users->count(),
        ];
    }

    private function getLowHydrationEntries($days)
    {
        $startDate = Carbon::now()->subDays($days);

        return HydrationEntry::query()
            ->join('users', 'hydration_entries.user_id', '=', 'users.id')
            ->where('hydration_entries.created_at', '>=', $startDate)
            ->where('users.role', '!=', 'admin')
            ->groupBy('hydration_entries.user_id', 'users.name', 'users.hydration_goal', DB::raw('DATE(hydration_entries.created_at)'))
            ->select(
                'hydration_entries.user_id',
                'users.name',
                DB::raw('COALESCE(users.hydration_goal, 2000) as goal'),
                DB::raw('DATE(hydration_entries.created_at) as intake_date'),
                DB::raw('SUM(hydration_entries.amount_ml) as actual')
            )
            ->havingRaw('SUM(hydration_entries.amount_ml) < (COALESCE(users.hydration_goal, 2000) * 0.5)')
            ->orderByDesc('intake_date')
            ->limit(15)
            ->get()
            ->map(function ($entry) {
                return [
                    'user_id' => $entry->user_id,
                    'name' => $entry->name,
                    'date' => Carbon::parse($entry->intake_date),
                    'goal' => (int) $entry->goal,
                    'actual' => (int) $entry->actual,
                    'percentage' => $entry->goal > 0 ? round(($entry->actual / $entry->goal) * 100, 1) : 0,
                ];
            });
    }
}
