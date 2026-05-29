@extends('layouts.app')

@section('title', 'Medication Management')

@section('content')
<div class="min-h-screen bg-slate-50 py-3">
    <div class="max-w-7xl mx-auto px-4 sm:px-6">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-5">
            <div>
                <h1 class="text-3xl font-bold text-slate-900">Medication Management</h1>
                <p class="text-slate-500 mt-1">Backend medication schedules, history, and adherence risk.</p>
            </div>
            <select id="timeRange" data-base-url="{{ route('admin.medication.index') }}" class="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="7" {{ (int) $timeRange === 7 ? 'selected' : '' }}>Last 7 days</option>
                <option value="30" {{ (int) $timeRange === 30 ? 'selected' : '' }}>Last 30 days</option>
                <option value="90" {{ (int) $timeRange === 90 ? 'selected' : '' }}>Last 90 days</option>
            </select>
        </div>

        @php
            $summaryCards = [
                ['label' => 'Active Medications', 'value' => number_format($activeMedications), 'meta' => 'active or unexpired records', 'tone' => 'teal'],
                ['label' => 'Adherence Rate', 'value' => $adherenceRate . '%', 'meta' => 'taken/completed history', 'tone' => 'green'],
                ['label' => 'Taken / Completed', 'value' => number_format($takenDoses), 'meta' => 'successful dose records', 'tone' => 'blue'],
                ['label' => 'Missed Doses', 'value' => number_format($missedDoses), 'meta' => 'missed or skipped', 'tone' => 'red'],
                ['label' => 'Snoozed Doses', 'value' => number_format($snoozedDoses), 'meta' => 'delayed, not completed', 'tone' => 'amber'],
                ['label' => 'Critical Users', 'value' => number_format($criticalMissedMedications->count()), 'meta' => 'repeated missed doses', 'tone' => 'red'],
            ];
            $toneClasses = [
                'teal' => 'bg-teal-50 text-teal-700',
                'green' => 'bg-green-50 text-green-700',
                'blue' => 'bg-blue-50 text-blue-700',
                'red' => 'bg-red-50 text-red-700',
                'amber' => 'bg-amber-50 text-amber-700',
            ];
            $trendRows = collect($weeklyAdherenceData)->take(-14)->values();
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

        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden mb-5">
            <div class="px-4 py-3 border-b border-red-100 bg-red-50">
                <h2 class="text-base font-bold text-red-900">Critical Missed Doses Alert</h2>
                <p class="text-xs text-red-700 mt-1">Users with repeated missed/skipped medication records in this range.</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">User</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Email</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Missed</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Medications</th>
                            <th class="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Action</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        @forelse($criticalMissedMedications as $record)
                        <tr class="hover:bg-slate-50">
                            <td class="px-4 py-3 text-sm font-semibold text-slate-900">{{ $record['user_name'] }}</td>
                            <td class="px-4 py-3 text-sm text-slate-600">{{ $record['user_email'] }}</td>
                            <td class="px-4 py-3"><span class="inline-flex px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">{{ $record['missed_count'] }} times</span></td>
                            <td class="px-4 py-3 text-sm text-slate-600">{{ $record['medications'] }}</td>
                            <td class="px-4 py-3 text-right"><a href="{{ route('admin.users.show', $record['user_id']) }}" class="text-sm font-semibold text-blue-600 hover:text-blue-700">View</a></td>
                        </tr>
                        @empty
                        <tr><td colspan="5" class="px-4 py-5 text-center text-sm text-slate-500">No critical missed dose patterns in this range.</td></tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-100 bg-green-50">
                    <h2 class="text-base font-bold text-green-900">Top Performers</h2>
                    <p class="text-xs text-green-700 mt-1">One row per user.</p>
                </div>
                <div class="divide-y divide-slate-100">
                    @forelse($complianceRanking['top_users'] as $user)
                    @php
                        $userAdherencePercent = max(0, min(100, (float) ($user['adherence_rate'] ?? 0)));
                        $userAdherenceStyle = '--bar-width: ' . $userAdherencePercent . '%; width: var(--bar-width);';
                    @endphp
                    <div class="px-4 py-3">
                        <div class="flex items-center justify-between gap-3">
                            <div class="min-w-0">
                                <p class="text-sm font-semibold text-slate-900 truncate">{{ $user['name'] }}</p>
                                <p class="text-xs text-slate-500">{{ $user['completed'] }}/{{ $user['total'] }} doses completed</p>
                            </div>
                            <p class="text-sm font-bold text-green-700">{{ $user['adherence_rate'] }}%</p>
                        </div>
                        <div class="mt-2 h-1.5 rounded-full bg-slate-100"><div class="h-1.5 rounded-full bg-green-500" {!! 'style="' . e($userAdherenceStyle) . '"' !!}></div></div>
                    </div>
                    @empty
                    <div class="px-4 py-5 text-center text-sm text-slate-500">No adherence data yet.</div>
                    @endforelse
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-100 bg-amber-50">
                    <h2 class="text-base font-bold text-amber-900">Need Attention</h2>
                    <p class="text-xs text-amber-700 mt-1">Lowest user adherence, deduped.</p>
                </div>
                <div class="divide-y divide-slate-100">
                    @forelse($complianceRanking['bottom_users'] as $user)
                    @php
                        $userAdherencePercent = max(0, min(100, (float) ($user['adherence_rate'] ?? 0)));
                        $userAdherenceStyle = '--bar-width: ' . $userAdherencePercent . '%; width: var(--bar-width);';
                    @endphp
                    <div class="px-4 py-3">
                        <div class="flex items-center justify-between gap-3">
                            <div class="min-w-0">
                                <p class="text-sm font-semibold text-slate-900 truncate">{{ $user['name'] }}</p>
                                <p class="text-xs text-slate-500">{{ $user['completed'] }}/{{ $user['total'] }} doses completed</p>
                            </div>
                            <p class="text-sm font-bold {{ $user['adherence_rate'] < 60 ? 'text-red-700' : 'text-amber-700' }}">{{ $user['adherence_rate'] }}%</p>
                        </div>
                        <div class="mt-2 h-1.5 rounded-full bg-slate-100"><div class="h-1.5 rounded-full {{ $user['adherence_rate'] < 60 ? 'bg-red-500' : 'bg-amber-500' }}" {!! 'style="' . e($userAdherenceStyle) . '"' !!}></div></div>
                    </div>
                    @empty
                    <div class="px-4 py-5 text-center text-sm text-slate-500">No attention list for this range.</div>
                    @endforelse
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h2 class="text-base font-bold text-slate-900">Adherence Trend</h2>
                <p class="text-xs text-slate-500 mt-1">Compact daily backend history view.</p>
                @if($trendRows->sum('adherence') > 0)
                <div class="mt-4 flex items-end gap-1 h-28 border-b border-slate-100">
                    @foreach($trendRows as $point)
                    @php
                        $trendHeight = max(3, min(100, (float) ($point['adherence'] ?? 0)));
                        $trendStyle = '--bar-height: ' . $trendHeight . '%; height: var(--bar-height);';
                    @endphp
                    <div class="flex-1 flex flex-col items-center justify-end gap-1">
                        <div class="w-full rounded-t bg-blue-500/80" {!! 'style="' . e($trendStyle) . '"' !!}></div>
                    </div>
                    @endforeach
                </div>
                <div class="mt-2 flex justify-between text-[11px] text-slate-400">
                    <span>{{ $trendRows->first()['date'] ?? '' }}</span>
                    <span>{{ $trendRows->last()['date'] ?? '' }}</span>
                </div>
                @else
                <div class="mt-4 rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No adherence trend data in this range.</div>
                @endif
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <div class="lg:col-span-1 bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h2 class="text-base font-bold text-slate-900">Adherence by Medication</h2>
                <p class="text-xs text-slate-500 mt-1">Supported medication names only.</p>
                <div class="mt-4 space-y-3">
                    @forelse($medicationTypeData as $item)
                    @php
                        $medicationAdherencePercent = max(0, min(100, (float) ($item['adherence'] ?? 0)));
                        $medicationAdherenceStyle = '--bar-width: ' . $medicationAdherencePercent . '%; width: var(--bar-width);';
                    @endphp
                    <div>
                        <div class="flex items-center justify-between gap-3">
                            <p class="text-sm font-semibold text-slate-700 truncate">{{ $item['type'] }}</p>
                            <p class="text-xs font-bold text-slate-700">{{ $item['adherence'] }}%</p>
                        </div>
                        <div class="mt-1.5 h-1.5 rounded-full bg-slate-100"><div class="h-1.5 rounded-full bg-teal-500" {!! 'style="' . e($medicationAdherenceStyle) . '"' !!}></div></div>
                    </div>
                    @empty
                    <div class="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No medication history in this range.</div>
                    @endforelse
                </div>
            </div>

            <div class="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h2 class="text-base font-bold text-slate-900">Recent Problematic Entries</h2>
                        <p class="text-xs text-slate-500 mt-1">Missed, skipped, and snoozed records. Latest {{ $problematicEntries->count() }} shown.</p>
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Date</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">User</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Medication</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Scheduled</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Taken</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Action</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            @forelse($problematicEntries as $entry)
                            @php $status = strtolower((string) $entry->status); @endphp
                            <tr class="hover:bg-slate-50">
                                <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ $entry->created_at->format('M j, Y') }}</td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm font-semibold text-slate-900">{{ $entry->user->name ?? 'Unknown User' }}</td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ $entry->medication_name_snapshot ?: ($entry->medication->name ?? 'Unknown') }}</td>
                                <td class="px-4 py-3 whitespace-nowrap"><span class="inline-flex px-2 py-1 rounded-full text-xs font-semibold {{ in_array($status, ['missed', 'skipped'], true) ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700' }}">{{ ucfirst($status) }}</span></td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ $entry->scheduled_time ? $entry->scheduled_time->format('M j, H:i') : '-' }}</td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ $entry->taken_time ? $entry->taken_time->format('M j, H:i') : '-' }}</td>
                                <td class="px-4 py-3 text-right whitespace-nowrap"><a href="{{ route('admin.users.show', $entry->user_id) }}" class="text-sm font-semibold text-blue-600 hover:text-blue-700">View</a></td>
                            </tr>
                            @empty
                            <tr><td colspan="7" class="px-4 py-6 text-center text-sm text-slate-500">No problematic entries in this range.</td></tr>
                            @endforelse
                        </tbody>
                    </table>
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
