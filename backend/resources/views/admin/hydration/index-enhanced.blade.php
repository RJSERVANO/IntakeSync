@extends('layouts.app')

@section('title', 'Beverage Management')

@section('content')
<div class="min-h-screen bg-slate-50 py-3">
    <div class="max-w-7xl mx-auto px-4 sm:px-6">
        <!-- Page Header -->
        <div class="flex flex-col md:flex-row md:items-center md:justify-between mb-5">
            <div>
                <h1 class="text-3xl font-bold text-slate-900">Beverage Management</h1>
                <p class="text-slate-500 mt-2">Monitor beverage intake goals, daily fluid logs, and low-intake exceptions</p>
            </div>
            <div class="flex items-center gap-3 mt-3 md:mt-0">
                <select id="timeRange" data-base-url="{{ route('admin.hydration.index') }}" class="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition">
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
                    <div class="p-3 bg-blue-50 rounded-xl">
                        <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3s6 6.7 6 11a6 6 0 11-12 0c0-4.3 6-11 6-11z"></path>
                        </svg>
                    </div>
                </div>
                <div>
                    <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Tracked Users</p>
                    <p class="text-3xl font-bold text-slate-900">{{ $totalUsers }}</p>
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex items-start justify-between mb-3">
                    <div class="p-3 bg-green-50 rounded-xl">
                        <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 19h16M7 19V9a5 5 0 0110 0v10M9 9h6m-6 4h6"></path>
                        </svg>
                    </div>
                </div>
                <div>
                    <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Avg Daily Intake</p>
                    <p class="text-3xl font-bold text-slate-900">{{ number_format($avgDailyIntake) }}</p>
                    <p class="text-xs text-slate-500 mt-2">ml per day</p>
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex items-start justify-between mb-3">
                    <div class="p-3 bg-amber-50 rounded-xl">
                        <svg class="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                </div>
                <div>
                    <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Goal Achievement</p>
                    <p class="text-3xl font-bold text-slate-900">{{ $goalAchievement }}%</p>
                    <p class="text-xs text-slate-500 mt-2">of users on track</p>
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex items-start justify-between mb-3">
                    <div class="p-3 bg-red-50 rounded-xl">
                        <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3s6 6.7 6 11a6 6 0 11-12 0c0-4.3 6-11 6-11zM12 10v3m0 3h.01"></path>
                        </svg>
                    </div>
                </div>
                <div>
                    <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">At-Risk Users</p>
                    <p class="text-3xl font-bold text-slate-900">{{ $atRiskUsers->count() }}</p>
                    <p class="text-xs text-slate-500 mt-2">Below 50% goal</p>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Beverage Logs</p>
                <p class="text-3xl font-bold text-slate-900">{{ number_format($totalBeverageLogs) }}</p>
                <p class="text-xs text-slate-500 mt-2">entries in selected range</p>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Water Share</p>
                <p class="text-3xl font-bold text-slate-900">{{ $waterShare }}%</p>
                <p class="text-xs text-slate-500 mt-2">of total logged volume</p>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Caffeine/Sugar Flags</p>
                <p class="text-3xl font-bold text-slate-900">{{ number_format($awarenessFlags) }}</p>
                <p class="text-xs text-slate-500 mt-2">medium or high awareness logs</p>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Missed Reminders</p>
                <p class="text-2xl font-bold text-slate-900">{{ $missedReminders === null ? 'Not tracked' : number_format($missedReminders) }}</p>
                <p class="text-xs text-slate-500 mt-2">backend hydration_entries only</p>
            </div>
        </div>

        <!-- IntakeSync Beverage Awareness -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-100">
                    <h3 class="text-lg font-bold text-slate-900">Beverage Mix</h3>
                    <p class="text-slate-500 text-sm">Volume and log counts by IntakeSync category</p>
                </div>
                <div class="divide-y divide-slate-100">
                    @forelse($beverageBreakdown as $item)
                    <div class="px-4 py-3 flex items-center justify-between gap-4">
                        <div>
                            <p class="font-semibold {{ ($item['unsupported'] ?? false) ? 'text-red-800' : 'text-slate-900' }}">{{ $item['label'] }}</p>
                            <p class="text-xs text-slate-500">{{ number_format($item['log_count']) }} logs</p>
                        </div>
                        <p class="text-sm font-bold text-slate-700">{{ number_format($item['total_ml']) }} ml</p>
                    </div>
                    @empty
                    <div class="px-4 py-5 text-center text-sm text-slate-400">No beverage logs in this range</div>
                    @endforelse
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-100">
                    <h3 class="text-lg font-bold text-slate-900">Log Sources</h3>
                    <p class="text-slate-500 text-sm">Manual, quick add, custom, and reminder-driven entries</p>
                </div>
                <div class="divide-y divide-slate-100">
                    @forelse($sourceBreakdown as $item)
                    <div class="px-4 py-3 flex items-center justify-between gap-4">
                        <p class="font-semibold text-slate-900">{{ $item['label'] }}</p>
                        <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">{{ number_format($item['log_count']) }} logs</span>
                    </div>
                    @empty
                    <div class="px-4 py-5 text-center text-sm text-slate-400">No source data in this range</div>
                    @endforelse
                </div>
            </div>
        </div>

        <!-- At-Risk Users Table -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden mb-5">
            <div class="px-4 py-3 border-b border-slate-100 bg-red-50">
                <h3 class="text-lg font-bold text-red-900">At-Risk Users (Below 50% Goal)</h3>
                <p class="text-sm text-red-700 mt-1">Immediate intervention recommended for these users</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">User Name</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Email</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Daily Goal</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Avg Intake</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Achievement %</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Days Logged</th>
                            <th class="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        @forelse($atRiskUsers as $user)
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-6 py-4 whitespace-nowrap">
                                <p class="font-medium text-slate-900">{{ $user['name'] }}</p>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <p class="text-sm text-slate-600">{{ $user['email'] }}</p>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <p class="text-sm font-medium text-slate-900">{{ number_format($user['goal']) }} ml</p>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <p class="text-sm text-slate-600">{{ number_format($user['intake']) }} ml</p>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <div class="flex items-center gap-2">
                                    <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800">{{ $user['percentage'] }}%</span>
                                    <div class="w-12 h-2 bg-slate-200 rounded-full">
                                        <div class="bg-red-600 h-2 rounded-full progress-width" data-width="{{ min($user['percentage'], 100) }}"></div>
                                    </div>
                                </div>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <p class="text-sm text-slate-600">{{ $user['days_logged'] }} days</p>
                            </td>
                            <td class="px-6 py-4 text-right whitespace-nowrap">
                                <a href="{{ route('admin.users.show', $user['id']) }}" class="text-blue-600 hover:text-blue-900 text-sm font-medium">View Profile -></a>
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="7" class="px-6 py-8 text-center text-slate-400">
                                <p class="text-sm">No at-risk users found</p>
                            </td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Goal vs Actual Comparison Chart -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">Goal vs Actual Comparison</h3>
                        <p class="text-slate-500 text-sm">Weekly beverage intake performance</p>
                    </div>
                </div>
                <div class="relative h-44 w-full">
                    <canvas id="goalVsActualChart"></canvas>
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">Weekly Beverage Trend</h3>
                        <p class="text-slate-500 text-sm">Last 30 days average</p>
                    </div>
                </div>
                <div class="relative h-44 w-full">
                    <canvas id="weeklyTrendChart"></canvas>
                </div>
            </div>
        </div>

        <!-- Low Intake Entries Table -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden mb-5">
            <div class="px-4 py-3 border-b border-slate-100">
                <h3 class="text-lg font-bold text-slate-900">Recent Beverage Logs</h3>
                <p class="text-slate-500 text-sm">Latest IntakeSync logs with category, source, caffeine, and sugar context</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Time</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">User</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Drink</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Amount</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Sugar</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Caffeine</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Source</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        @forelse($recentBeverageEntries as $entry)
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{{ $entry['created_at']->format('M d, g:i A') }}</td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <a href="{{ route('admin.users.show', $entry['user_id']) }}" class="font-medium text-blue-600 hover:text-blue-800">{{ $entry['user_name'] }}</a>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <p class="font-medium {{ ($entry['unsupported'] ?? false) ? 'text-red-800' : 'text-slate-900' }}">{{ $entry['beverage_label'] }}</p>
                                <p class="text-xs {{ ($entry['unsupported'] ?? false) ? 'text-red-600' : 'text-slate-500' }}">{{ $entry['beverage_type'] }}</p>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">{{ number_format($entry['amount_ml']) }} ml</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{{ $entry['sugar_level'] }}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{{ $entry['caffeine_level'] }}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{{ $entry['source'] }}</td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="7" class="px-6 py-8 text-center text-slate-400">
                                <p class="text-sm">No recent beverage logs found</p>
                            </td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100">
                <h3 class="text-lg font-bold text-slate-900">Low Intake Exceptions</h3>
                <p class="text-slate-500 text-sm">Days when users fell below 50% of daily goal</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">User</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Daily Goal</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Actual Intake</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Achievement %</th>
                            <th class="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100" id="lowIntakeTableBody">
                        @forelse($lowIntakeEntries as $entry)
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="text-sm text-slate-600">{{ $entry['date']->format('M d, Y') }}</span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <p class="font-medium text-slate-900">{{ $entry['name'] }}</p>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <p class="text-sm text-slate-600">{{ number_format($entry['goal']) }} ml</p>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <p class="text-sm text-slate-600">{{ number_format($entry['actual']) }} ml</p>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">{{ $entry['percentage'] }}%</span>
                            </td>
                            <td class="px-6 py-4 text-right whitespace-nowrap">
                                <a href="{{ route('admin.users.show', $entry['user_id']) }}" class="text-blue-600 hover:text-blue-900 text-sm font-medium">View -></a>
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="6" class="px-6 py-8 text-center text-slate-400">
                                <p class="text-sm">No low intake exceptions found</p>
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
<!-- htmlhint attr-unsafe-chars:false -->
<template id="hydrationChartData">@json($chartData)</template>
<script>
    let goalVsActualChart, weeklyTrendChart;

    function readJsonTemplate(id) {
        const template = document.getElementById(id);
        if (!template) {
            return [];
        }

        try {
            return JSON.parse(template.textContent || '[]');
        } catch (error) {
            console.error(`Invalid chart data in ${id}`, error);
            return [];
        }
    }

    function initDynamicStyles() {
        document.querySelectorAll('.progress-width[data-width]').forEach((bar) => {
            const width = Number(bar.getAttribute('data-width'));
            const boundedWidth = Number.isFinite(width) ? Math.max(0, Math.min(width, 100)) : 0;
            bar.style.width = `${boundedWidth}%`;
        });

        const timeRange = document.getElementById('timeRange');
        if (timeRange) {
            timeRange.addEventListener('change', () => {
                const url = new URL(timeRange.dataset.baseUrl || window.location.href, window.location.origin);
                url.searchParams.set('timeRange', timeRange.value);
                window.location.href = url.toString();
            });
        }
    }

    function initCharts() {
        const chartData = readJsonTemplate('hydrationChartData');

        // Goal vs Actual Chart
        const goalCtx = document.getElementById('goalVsActualChart');
        if (goalCtx) {
            goalVsActualChart = new Chart(goalCtx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: chartData.map(item => item.date),
                    datasets: [{
                            label: 'Goal',
                            data: chartData.map(item => item.goal),
                            backgroundColor: 'rgba(203, 213, 225, 0.5)',
                            borderColor: '#94a3b8',
                            borderWidth: 1
                        },
                        {
                            label: 'Actual',
                            data: chartData.map(item => item.actual),
                            backgroundColor: '#3b82f6',
                            borderColor: '#1e40af',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                borderDash: [2, 2],
                                drawBorder: false
                            },
                            ticks: {
                                callback: function(value) {
                                    return value + ' ml';
                                }
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

        // Weekly Trend Chart
        const weeklyCtx = document.getElementById('weeklyTrendChart');
        if (weeklyCtx) {
            weeklyTrendChart = new Chart(weeklyCtx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: chartData.map(item => item.date),
                    datasets: [{
                        label: 'Average Daily Intake',
                        data: chartData.map(item => item.actual),
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#22c55e',
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
                            display: true
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                borderDash: [2, 2],
                                drawBorder: false
                            },
                            ticks: {
                                callback: function(value) {
                                    return value + ' ml';
                                }
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
    }

    document.addEventListener('DOMContentLoaded', () => {
        initDynamicStyles();
        initCharts();
    });
</script>
@endpush
@endsection
