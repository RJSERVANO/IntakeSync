@extends('layouts.app')

@section('title', 'Dashboard')

@section('content')
<div class="min-h-screen bg-slate-50 py-3">
    <div class="max-w-7xl mx-auto px-4 sm:px-6">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-5">
            <div>
                <h1 class="text-3xl font-bold text-slate-900">Dashboard</h1>
                <p class="text-slate-500 mt-1">Live admin overview from backend-persisted IntakeSync data.</p>
            </div>
            <div class="flex flex-wrap gap-2">
                <a href="{{ route('admin.hydration.index') }}" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-white font-medium text-sm">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3s6 6.7 6 11a6 6 0 11-12 0c0-4.3 6-11 6-11z"></path></svg>
                    Beverage Analytics
                </a>
                <a href="{{ route('admin.users.create') }}" class="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 font-medium text-sm shadow-sm">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    Create User
                </a>
            </div>
        </div>

        @php
            $summaryCards = [
                ['label' => 'Total Users', 'value' => number_format($totalUsers), 'meta' => $usersLast30Days . ' new in 30 days' . ($userGrowthChange !== null ? ' (' . ($userGrowthChange >= 0 ? '+' : '') . $userGrowthChange . '%)' : ''), 'color' => 'blue'],
                ['label' => 'Active Users Today', 'value' => number_format($dau), 'meta' => 'login, sync, beverage, or medication activity', 'color' => 'green'],
                ['label' => 'Beverage Compliance', 'value' => $hydrationCompliance['compliance_rate'] . '%', 'meta' => $hydrationCompliance['users_on_track'] . ' of ' . $hydrationCompliance['total_users'] . ' users on track', 'color' => 'blue'],
                ['label' => 'Medication Adherence', 'value' => $medicationAdherence['total'] > 0 ? $medicationAdherence['rate'] . '%' : 'No data', 'meta' => $medicationAdherence['successful'] . ' of ' . $medicationAdherence['total'] . ' successful doses', 'color' => 'teal'],
                ['label' => 'Notification Effectiveness', 'value' => $notificationEffectiveness['total'] > 0 ? $notificationEffectiveness['rate'] . '%' : 'No data', 'meta' => $notificationEffectiveness['engaged'] . ' of ' . $notificationEffectiveness['total'] . ' actioned', 'color' => 'purple'],
                ['label' => 'At-Risk / Critical Users', 'value' => number_format($atRiskUsersCount + $criticalUsersCount), 'meta' => $atRiskUsersCount . ' low beverage, ' . $criticalUsersCount . ' medication critical', 'color' => 'red'],
            ];
        @endphp

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            @foreach($summaryCards as $card)
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">{{ $card['label'] }}</p>
                        <p class="text-2xl font-bold text-slate-900 mt-2">{{ $card['value'] }}</p>
                    </div>
                    <span class="h-9 w-9 rounded-lg flex items-center justify-center bg-{{ $card['color'] }}-50 text-{{ $card['color'] }}-600">
                        <span class="h-2.5 w-2.5 rounded-full bg-current"></span>
                    </span>
                </div>
                <p class="text-xs text-slate-500 mt-3">{{ $card['meta'] }}</p>
            </div>
            @endforeach
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h2 class="text-base font-bold text-slate-900 mb-3">System Health</h2>
                <div class="space-y-2">
                    @foreach(['email_service' => 'Email Service', 'database' => 'Database'] as $key => $label)
                    <div class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                        <span class="text-sm font-medium text-slate-700">{{ $label }}</span>
                        <span class="text-xs font-semibold {{ $systemHealth[$key]['color'] === 'green' ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100' }} px-2 py-1 rounded-full">{{ ucfirst($systemHealth[$key]['status']) }}</span>
                    </div>
                    @endforeach
                    <div class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                        <span class="text-sm font-medium text-slate-700">Password Reset Requests</span>
                        <span class="text-xs font-semibold {{ $systemHealth['password_resets'] == 0 ? 'text-green-700 bg-green-100' : 'text-amber-700 bg-amber-100' }} px-2 py-1 rounded-full">{{ $systemHealth['password_resets'] }} in last hour</span>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h2 class="text-base font-bold text-slate-900 mb-3">Quick Actions</h2>
                <div class="grid grid-cols-2 gap-2">
                    <a href="{{ route('admin.hydration.index') }}" class="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm font-semibold text-blue-900">Beverage<br><span class="text-xs font-medium text-blue-700">Analytics</span></a>
                    <a href="{{ route('admin.medication.index') }}" class="rounded-lg border border-teal-100 bg-teal-50 p-3 text-sm font-semibold text-teal-900">Medication<br><span class="text-xs font-medium text-teal-700">Adherence</span></a>
                    <a href="{{ route('admin.notifications.index') }}" class="rounded-lg border border-purple-100 bg-purple-50 p-3 text-sm font-semibold text-purple-900">Notifications<br><span class="text-xs font-medium text-purple-700">Delivery</span></a>
                    <a href="{{ route('admin.users.index') }}" class="rounded-lg border border-green-100 bg-green-50 p-3 text-sm font-semibold text-green-900">Users<br><span class="text-xs font-medium text-green-700">Manage</span></a>
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h2 class="text-base font-bold text-slate-900 mb-3">Beverage Snapshot</h2>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Water Share</p>
                        <p class="text-xl font-bold text-slate-900 mt-1">{{ $dashboardWaterShare }}%</p>
                    </div>
                    <div>
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Caffeine/Sugar Flags</p>
                        <p class="text-xl font-bold text-slate-900 mt-1">{{ number_format($dashboardAwarenessFlags) }}</p>
                    </div>
                </div>
                <div class="mt-3 space-y-2">
                    @forelse($dashboardBeverageBreakdown->take(3) as $item)
                    <div class="flex justify-between text-sm">
                        <span class="{{ $item['unsupported'] ?? false ? 'text-red-700 font-semibold' : 'text-slate-600' }}">{{ $item['label'] }}</span>
                        <span class="font-semibold text-slate-900">{{ number_format($item['total_ml']) }} ml</span>
                    </div>
                    @empty
                    <p class="text-sm text-slate-500">No beverage logs this week.</p>
                    @endforelse
                </div>
                <p class="text-xs text-slate-500 mt-3">{{ $dashboardMissedHydrationReminders === null ? 'Hydration reminder misses are not tracked in backend analytics.' : number_format($dashboardMissedHydrationReminders) . ' missed reminders this week' }}</p>
            </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h2 class="text-base font-bold text-slate-900">Recent Activity Feed</h2>
                <span class="text-xs text-slate-500">Latest {{ $recentActivityFeed->count() }}</span>
            </div>
            <div class="divide-y divide-slate-100">
                @forelse ($recentActivityFeed as $activity)
                <div class="px-4 py-3 flex gap-3">
                    <div class="mt-1 h-2.5 w-2.5 rounded-full {{ $activity['color'] === 'red' ? 'bg-red-500' : ($activity['color'] === 'green' ? 'bg-green-500' : 'bg-blue-500') }}"></div>
                    <div class="min-w-0">
                        <p class="font-semibold text-sm text-slate-900">{{ $activity['title'] }}</p>
                        <p class="text-sm text-slate-600 truncate">{{ $activity['description'] }}</p>
                        <p class="text-xs text-slate-400 mt-0.5">{{ $activity['timestamp']->diffForHumans() }}</p>
                    </div>
                </div>
                @empty
                <div class="px-4 py-6 text-center text-sm text-slate-500">No recent backend activity.</div>
                @endforelse
            </div>
        </div>
    </div>
</div>
@endsection
