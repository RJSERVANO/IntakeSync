@extends('layouts.app')

@section('title', 'Beverage Management')

@section('content')
<div class="min-h-screen bg-slate-50 py-3">
    <div class="max-w-7xl mx-auto px-4 sm:px-6">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-5">
            <div>
                <h1 class="text-3xl font-bold text-slate-900">Beverage Management</h1>
                <p class="text-slate-500 mt-1">Backend hydration entries, beverage mix, and low-intake risk.</p>
            </div>
            <select id="timeRange" data-base-url="{{ route('admin.hydration.index') }}" class="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="7" {{ (int) $timeRange === 7 ? 'selected' : '' }}>Last 7 days</option>
                <option value="30" {{ (int) $timeRange === 30 ? 'selected' : '' }}>Last 30 days</option>
                <option value="90" {{ (int) $timeRange === 90 ? 'selected' : '' }}>Last 90 days</option>
            </select>
        </div>

        @php
            $summaryCards = [
                ['label' => 'Tracked Users', 'value' => number_format($totalUsers), 'meta' => 'active non-admin users', 'tone' => 'blue'],
                ['label' => 'Avg Daily Intake', 'value' => number_format($avgDailyIntake), 'meta' => 'ml per logged user/day', 'tone' => 'green'],
                ['label' => 'Goal Achievement', 'value' => $goalAchievement . '%', 'meta' => 'users on track', 'tone' => 'amber'],
                ['label' => 'At-Risk Users', 'value' => number_format($atRiskUsers->count()), 'meta' => 'below 50% goal', 'tone' => 'red'],
                ['label' => 'Beverage Logs', 'value' => number_format($totalBeverageLogs), 'meta' => 'entries in range', 'tone' => 'slate'],
                ['label' => 'Water Share', 'value' => $waterShare . '%', 'meta' => 'of logged volume', 'tone' => 'blue'],
                ['label' => 'Caffeine/Sugar Flags', 'value' => number_format($awarenessFlags), 'meta' => 'medium or high logs', 'tone' => 'amber'],
                ['label' => 'Missed Reminders', 'value' => $missedReminders === null ? 'Not tracked' : number_format($missedReminders), 'meta' => 'backend persisted only', 'tone' => 'slate'],
            ];
            $toneClasses = [
                'blue' => 'bg-blue-50 text-blue-700',
                'green' => 'bg-green-50 text-green-700',
                'amber' => 'bg-amber-50 text-amber-700',
                'red' => 'bg-red-50 text-red-700',
                'slate' => 'bg-slate-100 text-slate-700',
            ];
            $chartRows = collect($chartData)->take(-14)->values();
            $maxActual = max(1, (int) ($chartRows->max('actual') ?? 0));
            $maxGoal = max(1, (int) ($chartRows->max('goal') ?? 0));
            $maxTrend = max($maxActual, $maxGoal, 1);
            $maxBeverage = max(1, (int) ($beverageBreakdown->max('total_ml') ?? 0));
            $maxSource = max(1, (int) ($sourceBreakdown->max('log_count') ?? 0));
        @endphp

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            @foreach($summaryCards as $card)
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">{{ $card['label'] }}</p>
                        <p class="text-2xl font-bold text-slate-900 mt-2">{{ $card['value'] }}</p>
                    </div>
                    <span class="h-9 w-9 rounded-lg flex items-center justify-center {{ $toneClasses[$card['tone']] }}">
                        <span class="h-2.5 w-2.5 rounded-full bg-current"></span>
                    </span>
                </div>
                <p class="text-xs text-slate-500 mt-3">{{ $card['meta'] }}</p>
            </div>
            @endforeach
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h2 class="text-base font-bold text-slate-900">Beverage Mix</h2>
                <p class="text-xs text-slate-500 mt-1">Supported app categories; unsupported values are flagged.</p>
                <div class="mt-4 space-y-3">
                    @forelse($beverageBreakdown as $item)
                    @php
                        $beveragePercent = max(0, min(100, round(((float) ($item['total_ml'] ?? 0) / max(1, $maxBeverage)) * 100)));
                        $beverageStyle = '--bar-width: ' . $beveragePercent . '%; width: var(--bar-width);';
                    @endphp
                    <div>
                        <div class="flex items-center justify-between gap-3">
                            <div class="min-w-0">
                                <p class="text-sm font-semibold truncate {{ ($item['unsupported'] ?? false) ? 'text-red-800' : 'text-slate-700' }}">{{ $item['label'] }}</p>
                                <p class="text-xs {{ ($item['unsupported'] ?? false) ? 'text-red-600' : 'text-slate-500' }}">{{ number_format($item['log_count']) }} logs</p>
                            </div>
                            <p class="text-xs font-bold text-slate-700">{{ number_format($item['total_ml']) }} ml</p>
                        </div>
                        <div class="mt-1.5 h-1.5 rounded-full bg-slate-100">
                            <div class="h-1.5 rounded-full {{ ($item['unsupported'] ?? false) ? 'bg-red-500' : 'bg-blue-500' }}" {!! 'style="' . e($beverageStyle) . '"' !!}></div>
                        </div>
                    </div>
                    @empty
                    <div class="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No beverage logs in this range.</div>
                    @endforelse
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h2 class="text-base font-bold text-slate-900">Log Sources</h2>
                <p class="text-xs text-slate-500 mt-1">Manual, quick, custom, and reminder entries.</p>
                <div class="mt-4 space-y-3">
                    @forelse($sourceBreakdown as $item)
                    @php
                        $sourcePercent = max(0, min(100, round(((float) ($item['log_count'] ?? 0) / max(1, $maxSource)) * 100)));
                        $sourceStyle = '--bar-width: ' . $sourcePercent . '%; width: var(--bar-width);';
                    @endphp
                    <div>
                        <div class="flex items-center justify-between gap-3">
                            <p class="text-sm font-semibold text-slate-700">{{ $item['label'] }}</p>
                            <p class="text-xs font-bold text-slate-700">{{ number_format($item['log_count']) }}</p>
                        </div>
                        <div class="mt-1.5 h-1.5 rounded-full bg-slate-100"><div class="h-1.5 rounded-full bg-teal-500" {!! 'style="' . e($sourceStyle) . '"' !!}></div></div>
                    </div>
                    @empty
                    <div class="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No source data in this range.</div>
                    @endforelse
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h2 class="text-base font-bold text-slate-900">Goal vs Actual</h2>
                <p class="text-xs text-slate-500 mt-1">Compact average intake trend.</p>
                @if($chartRows->sum('actual') > 0 || $chartRows->sum('goal') > 0)
                <div class="mt-4 flex items-end gap-1 h-28 border-b border-slate-100">
                    @foreach($chartRows as $point)
                    @php
                        $goalHeight = max(4, min(100, round(((float) ($point['goal'] ?? 0) / max(1, $maxTrend)) * 100)));
                        $actualHeight = max(4, min(100, round(((float) ($point['actual'] ?? 0) / max(1, $maxTrend)) * 100)));
                        $goalStyle = '--bar-height: ' . $goalHeight . '%; height: var(--bar-height);';
                        $actualStyle = '--bar-height: ' . $actualHeight . '%; height: var(--bar-height);';
                    @endphp
                    <div class="flex-1 flex items-end justify-center gap-0.5" title="{{ $point['date'] }}: {{ number_format($point['actual']) }} ml">
                        <div class="w-1/2 rounded-t bg-slate-300" {!! 'style="' . e($goalStyle) . '"' !!}></div>
                        <div class="w-1/2 rounded-t bg-blue-500" {!! 'style="' . e($actualStyle) . '"' !!}></div>
                    </div>
                    @endforeach
                </div>
                <div class="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{{ $chartRows->first()['date'] ?? '' }}</span>
                    <span class="inline-flex items-center gap-3"><span><span class="inline-block h-2 w-2 rounded bg-slate-300"></span> Goal</span><span><span class="inline-block h-2 w-2 rounded bg-blue-500"></span> Actual</span></span>
                    <span>{{ $chartRows->last()['date'] ?? '' }}</span>
                </div>
                @else
                <div class="mt-4 rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No intake trend data in this range.</div>
                @endif
            </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden mb-5">
            <div class="px-4 py-3 border-b border-red-100 bg-red-50">
                <h2 class="text-base font-bold text-red-900">At-Risk Users</h2>
                <p class="text-xs text-red-700 mt-1">Users below 50% of hydration goal in backend-persisted data.</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">User</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Email</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Daily Goal</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Avg Intake</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Achievement</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Days</th>
                            <th class="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Action</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        @forelse($atRiskUsers as $user)
                        @php
                            $riskPercent = max(0, min(100, (float) ($user['percentage'] ?? 0)));
                            $riskStyle = '--bar-width: ' . $riskPercent . '%; width: var(--bar-width);';
                        @endphp
                        <tr class="hover:bg-slate-50">
                            <td class="px-4 py-3 whitespace-nowrap text-sm font-semibold text-slate-900">{{ $user['name'] }}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ $user['email'] }}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ number_format($user['goal']) }} ml</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ number_format($user['intake']) }} ml</td>
                            <td class="px-4 py-3 whitespace-nowrap">
                                <div class="flex items-center gap-2">
                                    <span class="inline-flex px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">{{ $user['percentage'] }}%</span>
                                    <div class="w-14 h-1.5 bg-slate-100 rounded-full"><div class="bg-red-500 h-1.5 rounded-full" {!! 'style="' . e($riskStyle) . '"' !!}></div></div>
                                </div>
                            </td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ $user['days_logged'] }}</td>
                            <td class="px-4 py-3 text-right"><a href="{{ route('admin.users.show', $user['id']) }}" class="text-sm font-semibold text-blue-600 hover:text-blue-700">View</a></td>
                        </tr>
                        @empty
                        <tr><td colspan="7" class="px-4 py-5 text-center text-sm text-slate-500">No at-risk users in this range.</td></tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div class="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h2 class="text-base font-bold text-slate-900">Recent Beverage Logs</h2>
                        <p class="text-xs text-slate-500 mt-1">Latest backend hydration entries. Raw sync IDs are not shown.</p>
                    </div>
                    <span class="text-xs text-slate-500">Latest {{ $recentBeverageEntries->count() }}</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Time</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">User</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Drink</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Amount</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Sugar</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Caffeine</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Source</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            @forelse($recentBeverageEntries as $entry)
                            <tr class="hover:bg-slate-50">
                                <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ $entry['created_at']->format('M j, g:i A') }}</td>
                                <td class="px-4 py-3 whitespace-nowrap"><a href="{{ route('admin.users.show', $entry['user_id']) }}" class="text-sm font-semibold text-blue-600 hover:text-blue-700">{{ $entry['user_name'] }}</a></td>
                                <td class="px-4 py-3 whitespace-nowrap">
                                    <p class="text-sm font-semibold {{ ($entry['unsupported'] ?? false) ? 'text-red-800' : 'text-slate-900' }}">{{ $entry['beverage_label'] }}</p>
                                    <p class="text-xs {{ ($entry['unsupported'] ?? false) ? 'text-red-600' : 'text-slate-500' }}">{{ $entry['beverage_type'] }}</p>
                                </td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm font-semibold text-slate-900">{{ number_format($entry['amount_ml']) }} ml</td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ $entry['sugar_level'] }}</td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ $entry['caffeine_level'] }}</td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ $entry['source'] }}</td>
                            </tr>
                            @empty
                            <tr><td colspan="7" class="px-4 py-6 text-center text-sm text-slate-500">No recent beverage logs in this range.</td></tr>
                            @endforelse
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-100">
                    <h2 class="text-base font-bold text-slate-900">Low Intake Exceptions</h2>
                    <p class="text-xs text-slate-500 mt-1">Latest below-goal days.</p>
                </div>
                <div class="divide-y divide-slate-100">
                    @forelse($lowIntakeEntries->take(8) as $entry)
                    <div class="px-4 py-3">
                        <div class="flex items-center justify-between gap-3">
                            <div class="min-w-0">
                                <p class="text-sm font-semibold text-slate-900 truncate">{{ $entry['name'] }}</p>
                                <p class="text-xs text-slate-500">{{ $entry['date']->format('M j, Y') }} · {{ number_format($entry['actual']) }} / {{ number_format($entry['goal']) }} ml</p>
                            </div>
                            <span class="inline-flex px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">{{ $entry['percentage'] }}%</span>
                        </div>
                        <div class="mt-2 flex justify-end">
                            <a href="{{ route('admin.users.show', $entry['user_id']) }}" class="text-xs font-semibold text-blue-600 hover:text-blue-700">View</a>
                        </div>
                    </div>
                    @empty
                    <div class="px-4 py-6 text-center text-sm text-slate-500">No low intake exceptions in this range.</div>
                    @endforelse
                </div>
            </div>
        </div>
    </div>
</div>

@push('scripts')
<script>
    document.addEventListener('DOMContentLoaded', () => {
        const timeRange = document.getElementById('timeRange');
        if (timeRange) {
            timeRange.addEventListener('change', () => {
                window.location = `${timeRange.dataset.baseUrl}?timeRange=${timeRange.value}`;
            });
        }
    });
</script>
@endpush
@endsection
