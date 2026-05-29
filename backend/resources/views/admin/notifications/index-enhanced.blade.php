@extends('layouts.app')

@section('title', 'Notifications Management - Enhanced')

@section('content')
<div class="min-h-screen bg-slate-50 py-3">
    <div class="max-w-7xl mx-auto px-4 sm:px-6">
        <!-- Page Header -->
        <div class="flex flex-col md:flex-row md:items-center md:justify-between mb-5">
            <div>
                <h1 class="text-3xl font-bold text-slate-900">Notifications Management</h1>
                <p class="text-slate-500 mt-2">Monitor notification delivery, engagement, and effectiveness metrics</p>
            </div>
            <div class="flex items-center gap-3 mt-3 md:mt-0">
                <select id="timeRange" data-base-url="{{ route('admin.notifications.index') }}" class="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition">
                    <option value="7" {{ (int) $timeRange === 7 ? 'selected' : '' }}>Last 7 days</option>
                    <option value="30" {{ (int) $timeRange === 30 ? 'selected' : '' }}>Last 30 days</option>
                    <option value="90" {{ (int) $timeRange === 90 ? 'selected' : '' }}>Last 90 days</option>
                </select>
            </div>
        </div>

        <!-- Stats Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex items-start justify-between mb-3">
                    <div class="p-3 bg-purple-50 rounded-xl">
                        <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"></path>
                        </svg>
                    </div>
                </div>
                <div>
                    <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Total Notifications</p>
                    <p class="text-3xl font-bold text-slate-900">{{ number_format($totalNotifications) }}</p>
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex items-start justify-between mb-3">
                    <div class="p-3 bg-green-50 rounded-xl">
                        <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7l8 6 8-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM9 14l2 2 4-4"></path>
                        </svg>
                    </div>
                </div>
                <div>
                    <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Delivered / Created</p>
                    <p class="text-3xl font-bold text-slate-900">{{ number_format($deliveredNotifications) }}</p>
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex items-start justify-between mb-3">
                    <div class="p-3 bg-blue-50 rounded-xl">
                        <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7zM15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                        </svg>
                    </div>
                </div>
                <div>
                    <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Open Rate</p>
                    <p class="text-3xl font-bold text-slate-900">{{ $openRate === null ? 'No data' : $openRate . '%' }}</p>
                    <p class="text-xs text-slate-500 mt-2">backend opened/read records</p>
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex items-start justify-between mb-3">
                    <div class="p-3 bg-amber-50 rounded-xl">
                        <svg class="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M12 3l7 4v5c0 4.4-2.9 8.4-7 9-4.1-.6-7-4.6-7-9V7l7-4z"></path>
                        </svg>
                    </div>
                </div>
                <div>
                    <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Effectiveness</p>
                    <p class="text-3xl font-bold text-slate-900">{{ $effectivenessRate === null ? 'No data' : $effectivenessRate . '%' }}</p>
                    <p class="text-xs text-slate-500 mt-2">notifications actioned/completed</p>
                </div>
            </div>
        </div>

        <!-- Additional Metrics -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div class="flex items-start justify-between">
                    <div>
                        <p class="text-sm font-medium text-slate-500 uppercase tracking-wide">Snoozed</p>
                        <p class="text-2xl font-bold text-slate-900 mt-2">{{ number_format($snoozedCount) }}</p>
                    </div>
                    <div class="text-right text-xs text-slate-500">
                        <div class="ml-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                        </div>
                        <p>{{ $totalNotifications > 0 ? round(($snoozedCount / $totalNotifications) * 100, 1) : 0 }}% of total</p>
                    </div>
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div class="flex items-start justify-between">
                    <div>
                        <p class="text-sm font-medium text-slate-500 uppercase tracking-wide">Failed</p>
                        <p class="text-2xl font-bold text-red-600 mt-2">{{ number_format($failedCount) }}</p>
                    </div>
                    <div class="text-right text-xs text-slate-500">
                        <div class="ml-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12M12 21a9 9 0 100-18 9 9 0 000 18z"></path>
                            </svg>
                        </div>
                        <p>{{ $totalNotifications > 0 ? round(($failedCount / $totalNotifications) * 100, 1) : 0 }}% of total</p>
                    </div>
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div class="flex items-start justify-between">
                    <div>
                        <p class="text-sm font-medium text-slate-500 uppercase tracking-wide">Avg Response Time</p>
                        <p class="text-2xl font-bold text-slate-900 mt-2">{{ $avgResponseMinutes === null ? '-' : $avgResponseMinutes . ' min' }}</p>
                    </div>
                    <div class="text-right text-xs text-slate-500">
                        <div class="ml-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                        </div>
                        <p>when opened</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Failed Notifications Log -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden mb-5">
            <div class="px-4 py-3 border-b border-slate-100 bg-red-50">
                <h3 class="text-lg font-bold text-red-900">Failed Notifications Log</h3>
                <p class="text-sm text-red-700 mt-1">Notifications that failed to deliver with error details</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">User</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Message</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Error Reason</th>
                            <th class="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        @forelse($failedNotifications as $notif)
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="text-sm text-slate-600">{{ $notif['created_at']->format('M d, Y H:i') }}</span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <p class="font-medium text-slate-900">{{ $notif['user_name'] }}</p>
                            </td>
                            <td class="px-6 py-4">
                                <p class="text-sm text-slate-600 truncate">{{ $notif['message'] }}</p>
                            </td>
                            <td class="px-6 py-4">
                                <p class="text-sm text-slate-600">{{ $notif['error'] }}</p>
                            </td>
                            <td class="px-6 py-4 text-right whitespace-nowrap">
                                <a href="{{ route('admin.users.show', $notif['user_id']) }}" class="text-blue-600 hover:text-blue-900 text-sm font-medium">View User -></a>
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="5" class="px-6 py-5 text-center text-slate-400">
                                <p class="text-sm">No failed notifications</p>
                            </td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Charts -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">Daily Notification Volume</h3>
                        <p class="text-slate-500 text-sm">Last 30 days trend</p>
                    </div>
                </div>
                @if(collect($notificationVolumeData)->sum('count') > 0)
                <div class="relative h-44 w-full">
                    <canvas id="dailyVolumeChart"></canvas>
                </div>
                @else
                <div class="h-24 rounded-lg bg-slate-50 flex items-center justify-center text-sm text-slate-500">No backend notification volume in this range.</div>
                @endif
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">Notification Types Distribution</h3>
                        <p class="text-slate-500 text-sm">Breakdown by notification type</p>
                    </div>
                </div>
                @if($notificationTypeData->isNotEmpty())
                <div class="relative h-44 w-full">
                    <canvas id="typesChart"></canvas>
                </div>
                @else
                <div class="h-24 rounded-lg bg-slate-50 flex items-center justify-center text-sm text-slate-500">No notification types recorded.</div>
                @endif
            </div>
        </div>

        <!-- Notification Effectiveness & User Interaction Status -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">Engagement Status</h3>
                        <p class="text-slate-500 text-sm">User interaction breakdown</p>
                    </div>
                </div>
                <div class="space-y-4">
                    @foreach($engagementBreakdown as $item)
                    <div>
                        <div class="flex justify-between mb-2">
                            <span class="text-sm font-semibold text-slate-700">{{ $item['label'] }}</span>
                            <span class="text-sm font-bold {{ $item['color'] === 'green' ? 'text-green-600' : ($item['color'] === 'blue' ? 'text-blue-600' : 'text-slate-600') }}">{{ $item['percent'] }}%</span>
                        </div>
                        <div class="w-full bg-slate-200 rounded-full h-2">
                            <div class="{{ $item['color'] === 'green' ? 'bg-green-600' : ($item['color'] === 'blue' ? 'bg-blue-600' : 'bg-slate-600') }} h-2 rounded-full" style="width: {{ $item['percent'] }}%"></div>
                        </div>
                        <p class="text-xs text-slate-500 mt-1">{{ $item['count'] }} notifications</p>
                    </div>
                    @endforeach
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">Effectiveness Score</h3>
                        <p class="text-slate-500 text-sm">Notifications that were actioned</p>
                    </div>
                </div>
                @if($effectivenessRate === null)
                <div class="h-24 rounded-lg bg-slate-50 flex items-center justify-center text-sm text-slate-500">No notification data yet.</div>
                @else
                <div class="flex flex-col items-center justify-center py-4">
                    <div
                        class="relative flex h-32 w-32 items-center justify-center rounded-full"
                        style="background: conic-gradient(#10b981 0deg {{ min(100, max(0, $effectivenessRate)) * 3.6 }}deg, #e2e8f0 {{ min(100, max(0, $effectivenessRate)) * 3.6 }}deg 360deg);"
                    >
                        <div class="absolute inset-3 rounded-full bg-white"></div>
                        <div class="absolute inset-0 rounded-full border border-slate-200"></div>
                        <div class="relative text-center">
                            <p class="text-3xl font-bold text-slate-900">{{ $effectivenessRate }}%</p>
                            <p class="text-xs text-slate-500 mt-1">effective</p>
                        </div>
                    </div>
                </div>
                @endif
            </div>
        </div>

        <!-- Recent Notifications with User Interaction -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100">
                <h3 class="text-lg font-bold text-slate-900">Recent Notifications</h3>
                <p class="text-slate-500 text-sm">Latest notifications with user interaction status</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">User</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Message</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Type</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">User Interaction</th>
                            <th class="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        @forelse($recentNotifications as $notif)
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="text-sm text-slate-600">{{ $notif['created_at']->format('M d, Y') }}</span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <p class="font-medium text-slate-900">{{ $notif['user_name'] }}</p>
                            </td>
                            <td class="px-6 py-4">
                                <p class="text-sm text-slate-600 truncate">{{ $notif['message'] }}</p>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="text-xs font-semibold text-slate-600">{{ $notif['type'] }}</span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold {{ $notif['status_key'] === 'delivered' || $notif['status_key'] === 'completed' ? 'bg-green-100 text-green-800' : ($notif['status_key'] === 'failed' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-800') }}">
                                    {{ $notif['status'] }}
                                </span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold {{ $notif['user_interaction'] === 'Opened & Actioned' ? 'bg-green-100 text-green-800' : ($notif['user_interaction'] === 'Opened Only' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800') }}">
                                    {{ $notif['user_interaction'] }}
                                </span>
                            </td>
                            <td class="px-6 py-4 text-right whitespace-nowrap">
                                <a href="{{ route('admin.users.show', $notif['user_id']) }}" class="text-blue-600 hover:text-blue-900 text-sm font-medium">View -></a>
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="7" class="px-6 py-8 text-center text-slate-400">
                                <p class="text-sm">No recent notifications</p>
                            </td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

@push('scripts')
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
    let dailyVolumeChart, typesChart;

    function initCharts() {
        // Daily Notification Volume
        const dailyCtx = document.getElementById('dailyVolumeChart');
        if (dailyCtx) {
            const volumeData = @json($notificationVolumeData);
            dailyVolumeChart = new Chart(dailyCtx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: volumeData.map(item => item.date),
                    datasets: [{
                        label: 'Notifications Sent',
                        data: volumeData.map(item => item.count),
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#8b5cf6',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 7
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                borderDash: [2, 2],
                                drawBorder: false
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });
        }

        // Notification Types Distribution
        const typesCtx = document.getElementById('typesChart');
        if (typesCtx) {
            const typeData = @json($notificationTypeData).filter(item => Number(item.count) > 0);
            const hasTypeData = typeData.length > 0;
            typesChart = new Chart(typesCtx.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: hasTypeData ? typeData.map(item => item.type) : ['No notifications'],
                    datasets: [{
                        data: hasTypeData ? typeData.map(item => Number(item.count)) : [1],
                        backgroundColor: hasTypeData ? ['#3b82f6', '#ef4444', '#fbbf24', '#10b981', '#8b5cf6'] : ['#e2e8f0'],
                        borderWidth: 0,
                        hoverOffset: hasTypeData ? 4 : 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '60%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            display: hasTypeData,
                            labels: {
                                usePointStyle: true,
                                boxWidth: 8,
                                padding: 15
                            }
                        },
                        tooltip: {
                            enabled: hasTypeData
                        }
                    }
                }
            });
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const timeRange = document.getElementById('timeRange');
        if (timeRange) {
            timeRange.addEventListener('change', () => {
                window.location = `${timeRange.dataset.baseUrl}?timeRange=${timeRange.value}`;
            });
        }

        initCharts();
    });
</script>
@endpush
@endsection
