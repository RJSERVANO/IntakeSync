@extends('layouts.app')

@section('title', 'Dashboard')

@section('content')
<div class="bg-slate-50 min-h-screen font-sans">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">

        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
            <div>
                <h1 class="text-3xl font-bold text-slate-900">Dashboard</h1>
                <p class="text-slate-500 mt-2">Live admin overview from IntakeSync users, beverage intake, medication, and notification data.</p>
            </div>
            <div class="flex gap-3">
                <a href="{{ route('admin.hydration.index') }}" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition font-medium text-sm">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3s6 6.7 6 11a6 6 0 11-12 0c0-4.3 6-11 6-11z"></path>
                    </svg>
                    Beverage Analytics
                </a>
                <a href="{{ route('admin.users.create') }}" class="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition shadow-sm font-medium">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                    </svg>
                    Create User
                </a>
            </div>
        </div>

        <!-- Key Metrics -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mb-8">
            <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex justify-between items-start">
                    <div class="flex flex-col">
                        <span class="text-slate-500 text-sm font-medium mb-1">Total Users</span>
                        <h3 class="text-2xl font-bold text-slate-900">{{ number_format($totalUsers) }}</h3>
                    </div>
                    <div class="p-3 bg-blue-50 rounded-xl">
                        <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
                        </svg>
                    </div>
                </div>
                <div class="mt-4 flex items-center text-sm">
                    <span class="text-green-600 font-medium flex items-center">
                        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                        </svg>
                        {{ $userGrowthChange >= 0 ? '+' : '' }}{{ $userGrowthChange }}%
                    </span>
                    <span class="text-slate-400 ml-2">{{ $usersLast30Days }} new in 30 days</span>
                </div>
            </div>

            <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex justify-between items-start">
                    <div class="flex flex-col">
                        <span class="text-slate-500 text-sm font-medium mb-1">Active Users (DAU)</span>
                        <h3 class="text-2xl font-bold text-slate-900">{{ number_format($dau) }}</h3>
                    </div>
                    <div class="p-3 bg-green-50 rounded-xl">
                        <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                        </svg>
                    </div>
                </div>
                <div class="mt-4 flex items-center text-sm">
                    <span class="text-slate-500 font-medium">Active today</span>
                    <span class="text-slate-400 ml-2">login, sync, beverage, or medication activity</span>
                </div>
            </div>
        </div>

        <!-- System Health & Quick Actions -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <!-- System Health -->
            <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h3 class="text-lg font-bold text-slate-900 mb-4">System Health</h3>
                <div class="space-y-3">
                    <div class="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                        <div class="flex items-center gap-3">
                            <div class="w-3 h-3 rounded-full {{ $systemHealth['email_service']['color'] === 'green' ? 'bg-green-500' : 'bg-red-500' }}"></div>
                            <span class="text-sm font-medium text-slate-700">Email Service</span>
                        </div>
                        <span class="text-xs font-semibold {{ $systemHealth['email_service']['color'] === 'green' ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100' }} px-2.5 py-1 rounded-full">{{ ucfirst($systemHealth['email_service']['status']) }}</span>
                    </div>
                    <div class="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                        <div class="flex items-center gap-3">
                            <div class="w-3 h-3 rounded-full {{ $systemHealth['database']['color'] === 'green' ? 'bg-green-500' : 'bg-red-500' }}"></div>
                            <span class="text-sm font-medium text-slate-700">Database</span>
                        </div>
                        <span class="text-xs font-semibold {{ $systemHealth['database']['color'] === 'green' ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100' }} px-2.5 py-1 rounded-full">{{ ucfirst($systemHealth['database']['status']) }}</span>
                    </div>
                    <div class="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                        <div class="flex items-center gap-3">
                            <div class="w-3 h-3 rounded-full {{ $systemHealth['password_resets'] == 0 ? 'bg-green-500' : 'bg-amber-500' }}"></div>
                            <span class="text-sm font-medium text-slate-700">Password Reset Requests</span>
                        </div>
                        <span class="text-xs font-semibold {{ $systemHealth['password_resets'] == 0 ? 'text-green-700 bg-green-100' : 'text-amber-700 bg-amber-100' }} px-2.5 py-1 rounded-full">{{ $systemHealth['password_resets'] }} in last hour</span>
                    </div>
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h3 class="text-lg font-bold text-slate-900 mb-4">Quick Actions</h3>
                <div class="grid grid-cols-2 gap-3">
                    <a href="{{ route('admin.hydration.index') }}" class="p-4 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-200">
                        <svg class="w-6 h-6 text-blue-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3s6 6.7 6 11a6 6 0 11-12 0c0-4.3 6-11 6-11z"></path>
                        </svg>
                        <span class="text-sm font-semibold text-blue-900">Beverage Intake</span>
                        <p class="text-xs text-blue-700 mt-1">View beverage analytics</p>
                    </a>
                    <a href="{{ route('admin.medication.index') }}" class="p-4 rounded-lg bg-teal-50 hover:bg-teal-100 transition-colors border border-teal-200">
                        <svg class="w-6 h-6 text-teal-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.5 7.5l6 6m-9.5 3.5a3.536 3.536 0 010-5l4.5-4.5a3.536 3.536 0 015 5L12 17.5a3.536 3.536 0 01-5 0z"></path>
                        </svg>
                        <span class="text-sm font-semibold text-teal-900">Medication Adherence</span>
                        <p class="text-xs text-teal-700 mt-1">Monitor adherence</p>
                    </a>
                    <a href="{{ route('admin.notifications.index') }}" class="p-4 rounded-lg bg-purple-50 hover:bg-purple-100 transition-colors border border-purple-200">
                        <svg class="w-6 h-6 text-purple-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"></path>
                        </svg>
                        <span class="text-sm font-semibold text-purple-900">Notifications</span>
                        <p class="text-xs text-purple-700 mt-1">Track delivery</p>
                    </a>
                    <a href="{{ route('admin.users.index') }}" class="p-4 rounded-lg bg-green-50 hover:bg-green-100 transition-colors border border-green-200">
                        <svg class="w-6 h-6 text-green-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
                        </svg>
                        <span class="text-sm font-semibold text-green-900">Users</span>
                        <p class="text-xs text-green-700 mt-1">Manage users</p>
                    </a>
                </div>
            </div>
        </div>

        <!-- Beverage & Compliance Summary -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h4 class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Beverage Compliance</h4>
                <div>
                    <div class="text-3xl font-bold text-slate-900">{{ $hydrationCompliance['compliance_rate'] }}%</div>
                    <p class="text-sm text-slate-600 mt-2">{{ $hydrationCompliance['users_on_track'] }} of {{ $hydrationCompliance['total_users'] }} users on track</p>
                    <div class="mt-4 w-full bg-slate-200 rounded-full h-2">
                        <div class="bg-blue-600 h-2 rounded-full progress-bar" data-width="{{ $hydrationCompliance['compliance_rate'] }}"></div>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h4 class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Notification Effectiveness</h4>
                <div>
                    <div class="text-3xl font-bold text-slate-900">{{ $notificationEffectiveness['rate'] }}%</div>
                    <p class="text-sm text-slate-600 mt-2">{{ $notificationEffectiveness['engaged'] }} of {{ $notificationEffectiveness['total'] }} engaged</p>
                    <div class="mt-4 w-full bg-slate-200 rounded-full h-2">
                        <div class="bg-purple-600 h-2 rounded-full progress-bar" data-width="{{ $notificationEffectiveness['rate'] }}"></div>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h4 class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">At-Risk Users</h4>
                <div>
                    <div class="text-3xl font-bold text-slate-900">{{ $atRiskUsersCount }}</div>
                    <p class="text-sm text-slate-600 mt-2">Below 50% beverage goal</p>
                    <a href="{{ route('admin.hydration.index') }}" class="mt-4 inline-block text-sm font-semibold text-blue-600 hover:text-blue-700">
                        View Details ->
                    </a>
                </div>
            </div>
        </div>

        <!-- Recent Activity Feed -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
            <div class="px-6 py-5 border-b border-slate-100">
                <h3 class="text-lg font-bold text-slate-900">Recent Activity Feed</h3>
            </div>
            <div class="divide-y divide-slate-100">
                @forelse ($recentActivityFeed as $activity)
                <div class="px-6 py-4 hover:bg-slate-50 transition-colors">
                    <div class="flex gap-4">
                        <div class="flex-shrink-0">
                            <div class="w-10 h-10 rounded-full {{ $activity['color'] === 'blue' ? 'bg-blue-100' : ($activity['color'] === 'green' ? 'bg-green-100' : 'bg-red-100') }} flex items-center justify-center">
                                <svg class="w-5 h-5 {{ $activity['color'] === 'blue' ? 'text-blue-600' : ($activity['color'] === 'green' ? 'text-green-600' : 'text-red-600') }}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    @if($activity['type'] === 'registration')
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path>
                                    @else
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    @endif
                                </svg>
                            </div>
                        </div>
                        <div class="flex-grow">
                            <h4 class="font-semibold text-slate-900">{{ $activity['title'] }}</h4>
                            <p class="text-sm text-slate-600 mt-0.5">{{ $activity['description'] }}</p>
                            <p class="text-xs text-slate-400 mt-1">{{ $activity['timestamp']->diffForHumans() }}</p>
                        </div>
                    </div>
                </div>
                @empty
                <div class="px-6 py-8 text-center text-slate-400">
                    <p class="text-sm">No recent activity</p>
                </div>
                @endforelse
            </div>
        </div>

        <!-- Charts -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <div class="flex items-center justify-between mb-6">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">User Growth Trend</h3>
                        <p class="text-slate-500 text-sm">Last 30 days performance</p>
                    </div>
                </div>
                <div class="relative h-64 w-full">
                    <canvas id="userGrowthChart"></canvas>
                </div>
            </div>

            <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <div class="flex items-center justify-between mb-6">
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">Platform Distribution</h3>
                        <p class="text-slate-500 text-sm">Current mobile app deployment</p>
                    </div>
                </div>
                <div class="relative h-64 w-full flex items-center justify-center">
                    <canvas id="platformSplitChart"></canvas>
                </div>
            </div>
        </div>
    </div>
</div>

@push('scripts')
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<!-- htmlhint attr-unsafe-chars:false -->
<template id="userGrowthData">@json($userGrowth)</template>
<template id="platformSplitData">@json($platformSplit)</template>
<script>
    let userGrowthChart, platformSplitChart;

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

    function initProgressBars() {
        document.querySelectorAll('.progress-bar[data-width]').forEach((bar) => {
            const width = Number(bar.getAttribute('data-width'));
            const boundedWidth = Number.isFinite(width) ? Math.max(0, Math.min(width, 100)) : 0;
            bar.style.width = `${boundedWidth}%`;
        });
    }

    function initCharts() {
        // User Growth Chart
        const userGrowthCtx = document.getElementById('userGrowthChart');
        if (userGrowthCtx) {
            const userGrowthData = readJsonTemplate('userGrowthData');
            userGrowthChart = new Chart(userGrowthCtx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: userGrowthData.map(item => item.date),
                    datasets: [{
                        label: 'Total Users',
                        data: userGrowthData.map(item => item.users),
                        borderColor: '#2563EB',
                        backgroundColor: (context) => {
                            const ctx = context.chart.ctx;
                            const gradient = ctx.createLinearGradient(0, 0, 0, 200);
                            gradient.addColorStop(0, 'rgba(37, 99, 235, 0.2)');
                            gradient.addColorStop(1, 'rgba(37, 99, 235, 0)');
                            return gradient;
                        },
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#2563EB',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6
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

        // Platform Split Chart
        const platformCtx = document.getElementById('platformSplitChart');
        if (platformCtx) {
            const platformData = readJsonTemplate('platformSplitData');
            platformSplitChart = new Chart(platformCtx.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: platformData.map(item => item.platform),
                    datasets: [{
                        data: platformData.map(item => item.count),
                        backgroundColor: ['#22C55E'],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '75%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                usePointStyle: true,
                                boxWidth: 8
                            }
                        }
                    }
                }
            });
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        initProgressBars();
        initCharts();
    });
</script>
@endpush
@endsection
