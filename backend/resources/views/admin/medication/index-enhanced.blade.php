@extends('layouts.app')

@section('title', 'Medication Management - Enhanced')

@section('content')
<div class="min-h-screen bg-slate-50 py-3">
    <div class="max-w-7xl mx-auto px-4 sm:px-6">
        <!-- Page Header -->
        <div class="flex flex-col md:flex-row md:items-center md:justify-between mb-5">
            <div>
                <h1 class="text-3xl font-bold text-slate-900">Medication Management</h1>
                <p class="text-slate-500 mt-2">Track medication schedules, adherence rates, and compliance issues</p>
            </div>
            <div class="flex items-center gap-3 mt-3 md:mt-0">
                <select id="timeRange" data-base-url="{{ route('admin.medication.index') }}" class="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition">
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
                    <div class="p-3 bg-teal-50 rounded-xl">
                        <svg class="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.5 7.5l6 6m-9.5 3.5a3.536 3.536 0 010-5l4.5-4.5a3.536 3.536 0 015 5L12 17.5a3.536 3.536 0 01-5 0z"></path>
                        </svg>
                    </div>
                </div>
                <div>
                    <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Active Medications</p>
                    <p class="text-3xl font-bold text-slate-900">{{ $activeMedications }}</p>
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex items-start justify-between mb-3">
                    <div class="p-3 bg-green-50 rounded-xl">
                        <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"></path>
                        </svg>
                    </div>
                </div>
                <div>
                    <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Adherence Rate</p>
                    <p class="text-3xl font-bold text-slate-900">{{ $adherenceRate }}%</p>
                    <p class="text-xs text-slate-500 mt-2">System-wide average</p>
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex items-start justify-between mb-3">
                    <div class="p-3 bg-red-50 rounded-xl">
                        <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v5m0 4h.01M10.5 7.5l6 6m-9.5 3.5a3.536 3.536 0 010-5l4.5-4.5a3.536 3.536 0 015 5L12 17.5a3.536 3.536 0 01-5 0z"></path>
                        </svg>
                    </div>
                </div>
                <div>
                    <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Missed Doses</p>
                    <p class="text-3xl font-bold text-slate-900">{{ $missedDoses }}</p>
                    <p class="text-xs text-slate-500 mt-2">this period</p>
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex items-start justify-between mb-3">
                    <div class="p-3 bg-amber-50 rounded-xl">
                        <svg class="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H3v-2a4 4 0 014-4h2m4-7a4 4 0 11-8 0 4 4 0 018 0m3 3l2 2 4-4"></path>
                        </svg>
                    </div>
                </div>
                <div>
                    <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Critical Users</p>
                    <p class="text-3xl font-bold text-slate-900">{{ $criticalMissedMedications->count() }}</p>
                    <p class="text-xs text-slate-500 mt-2">repeated offenders</p>
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Taken / Completed</p>
                <p class="text-3xl font-bold text-slate-900">{{ number_format($takenDoses) }}</p>
                <p class="text-xs text-slate-500 mt-2">successful history records</p>
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <p class="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">Snoozed Doses</p>
                <p class="text-3xl font-bold text-slate-900">{{ number_format($snoozedDoses) }}</p>
                <p class="text-xs text-slate-500 mt-2">delayed, not completed</p>
            </div>
        </div>

        <!-- Critical Missed Doses Alert -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden mb-5">
            <div class="px-4 py-3 border-b border-slate-100 bg-red-50">
                <h3 class="text-lg font-bold text-red-900">Critical Missed Doses Alert</h3>
                <p class="text-sm text-red-700 mt-1">Users with repeated missed medications requiring immediate follow-up</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">User Name</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Email</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Missed Count (7d)</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Medications</th>
                            <th class="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        @forelse($criticalMissedMedications as $record)
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <p class="font-medium text-slate-900">{{ $record['user_name'] }}</p>
                            </td>
                            <td class="px-6 py-4">
                                <p class="text-sm text-slate-600">{{ $record['user_email'] }}</p>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800">{{ $record['missed_count'] }} times</span>
                            </td>
                            <td class="px-6 py-4">
                                <p class="text-sm text-slate-600">{{ $record['medications'] }}</p>
                            </td>
                            <td class="px-6 py-4 text-right whitespace-nowrap">
                                <a href="{{ route('admin.users.show', $record['user_id']) }}" class="text-blue-600 hover:text-blue-900 text-sm font-medium">View Profile -></a>
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="5" class="px-6 py-8 text-center text-slate-400">
                                <p class="text-sm">No critical missed doses found</p>
                            </td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Compliance Ranking -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <!-- Top Performers -->
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-100 bg-green-50">
                    <h3 class="text-lg font-bold text-green-900">Top Performers</h3>
                    <p class="text-sm text-green-700 mt-1">Highest medication adherence rates</p>
                </div>
                <div class="divide-y divide-slate-100">
                    @forelse($complianceRanking['top_users'] as $user)
                    <div class="px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div>
                            <p class="font-semibold text-slate-900">{{ $user['name'] }}</p>
                            <p class="text-xs text-slate-500 mt-1">{{ $user['completed'] }}/{{ $user['total'] }} doses completed</p>
                        </div>
                        <div class="text-right">
                            <p class="text-lg font-bold text-green-600">{{ $user['adherence_rate'] }}%</p>
                            <div class="w-16 h-2 bg-slate-200 rounded-full mt-1">
                                <div class="bg-green-600 h-2 rounded-full" style="width: {{ $user['adherence_rate'] }}%"></div>
                            </div>
                        </div>
                    </div>
                    @empty
                    <div class="px-6 py-8 text-center text-slate-400">
                        <p class="text-sm">No data available</p>
                    </div>
                    @endforelse
                </div>
            </div>

            <!-- Bottom Performers -->
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-100 bg-red-50">
                    <h3 class="text-lg font-bold text-red-900">Need Attention</h3>
                    <p class="text-sm text-red-700 mt-1">Lowest medication adherence rates</p>
                </div>
                <div class="divide-y divide-slate-100">
                    @forelse($complianceRanking['bottom_users'] as $user)
                    <div class="px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div>
                            <p class="font-semibold text-slate-900">{{ $user['name'] }}</p>
                            <p class="text-xs text-slate-500 mt-1">{{ $user['completed'] }}/{{ $user['total'] }} doses completed</p>
                        </div>
                        <div class="text-right">
                            <p class="text-lg font-bold {{ $user['adherence_rate'] < 60 ? 'text-red-600' : 'text-amber-600' }}">{{ $user['adherence_rate'] }}%</p>
                            <div class="w-16 h-2 bg-slate-200 rounded-full mt-1">
                                <div class="{{ $user['adherence_rate'] < 60 ? 'bg-red-600' : 'bg-amber-600' }} h-2 rounded-full" style="width: {{ $user['adherence_rate'] }}%"></div>
                            </div>
                        </div>
                    </div>
                    @empty
                    <div class="px-6 py-8 text-center text-slate-400">
                        <p class="text-sm">No data available</p>
                    </div>
                    @endforelse
                </div>
            </div>
        </div>

        <!-- Charts -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">Adherence by Medication</h3>
                        <p class="text-slate-500 text-sm">Compliance rates from medication history records</p>
                    </div>
                </div>
                @if($medicationTypeData->isNotEmpty())
                <div class="relative h-44 w-full">
                    <canvas id="medicationTypeChart"></canvas>
                </div>
                @else
                <div class="h-24 rounded-lg bg-slate-50 flex items-center justify-center text-sm text-slate-500">No medication history in this range.</div>
                @endif
            </div>

            <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">Weekly Adherence Trend</h3>
                        <p class="text-slate-500 text-sm">Last 30 days performance</p>
                    </div>
                </div>
                @if(collect($weeklyAdherenceData)->sum('adherence') > 0)
                <div class="relative h-44 w-full">
                    <canvas id="weeklyAdherenceChart"></canvas>
                </div>
                @else
                <div class="h-24 rounded-lg bg-slate-50 flex items-center justify-center text-sm text-slate-500">No adherence trend data in this range.</div>
                @endif
            </div>
        </div>

        <!-- Problematic Entries -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100">
                <h3 class="text-lg font-bold text-slate-900">Recent Problematic Entries</h3>
                <p class="text-slate-500 text-sm">Missed, skipped, and snoozed medication records</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">User</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Medication</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Scheduled Time</th>
                            <th class="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Taken Time</th>
                            <th class="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        @forelse($problematicEntries as $entry)
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="text-sm text-slate-600">{{ $entry->created_at->format('M d, Y') }}</span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <p class="font-medium text-slate-900">{{ $entry->user->name ?? 'Unknown User' }}</p>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <p class="text-sm text-slate-600">{{ $entry->medication_name_snapshot ?: ($entry->medication->name ?? 'Unknown') }}</p>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold {{ in_array($entry->status, ['missed', 'skipped'], true) ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800' }}">
                                    {{ ucfirst($entry->status) }}
                                </span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <p class="text-sm text-slate-600">{{ $entry->scheduled_time ? $entry->scheduled_time->format('M d, Y H:i') : '-' }}</p>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <p class="text-sm text-slate-600">{{ $entry->taken_time ? $entry->taken_time->format('M d, Y H:i') : '-' }}</p>
                            </td>
                            <td class="px-6 py-4 text-right whitespace-nowrap">
                                <a href="{{ route('admin.users.show', $entry->user_id) }}" class="text-blue-600 hover:text-blue-900 text-sm font-medium">View -></a>
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="7" class="px-6 py-8 text-center text-slate-400">
                                <p class="text-sm">No problematic entries found</p>
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
<script>
    let medicationTypeChart, weeklyAdherenceChart;

    function initCharts() {
        // Adherence by medication
        const typeCtx = document.getElementById('medicationTypeChart');
        if (typeCtx) {
            const medicationTypes = @json($medicationTypeData);
            medicationTypeChart = new Chart(typeCtx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: medicationTypes.map(m => m.type),
                    datasets: [{
                        label: 'Adherence Rate (%)',
                        data: medicationTypes.map(m => m.adherence),
                        backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'],
                        borderRadius: 4
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            max: 100,
                            grid: {
                                borderDash: [2, 2],
                                drawBorder: false
                            },
                            ticks: {
                                callback: function(value) {
                                    return value + '%';
                                }
                            }
                        },
                        y: {
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });
        }

        // Medication adherence trend
        const weeklyCtx = document.getElementById('weeklyAdherenceChart');
        if (weeklyCtx) {
            const weeklyData = @json($weeklyAdherenceData);
            weeklyAdherenceChart = new Chart(weeklyCtx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: weeklyData.map(item => item.date),
                    datasets: [{
                        label: 'System-wide Adherence',
                        data: weeklyData.map(item => item.adherence),
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
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            grid: {
                                borderDash: [2, 2],
                                drawBorder: false
                            },
                            ticks: {
                                callback: function(value) {
                                    return value + '%';
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
