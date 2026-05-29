@extends('layouts.app')

@section('title', 'Notifications Management')

@section('content')
<div class="min-h-screen bg-slate-50 py-3">
    <div class="max-w-7xl mx-auto px-4 sm:px-6">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-5">
            <div>
                <h1 class="text-3xl font-bold text-slate-900">Notifications Management</h1>
                <p class="text-slate-500 mt-1">Backend-persisted notification and app activity records.</p>
            </div>
            <select id="timeRange" data-base-url="{{ route('admin.notifications.index') }}" class="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="7" {{ (int) $timeRange === 7 ? 'selected' : '' }}>Last 7 days</option>
                <option value="30" {{ (int) $timeRange === 30 ? 'selected' : '' }}>Last 30 days</option>
                <option value="90" {{ (int) $timeRange === 90 ? 'selected' : '' }}>Last 90 days</option>
            </select>
        </div>

        @php
            $openRateText = $openRateLabel ?? ($openRate === null ? 'No data yet' : $openRate . '%');
            $effectivenessText = $effectivenessRateLabel ?? ($effectivenessRate === null ? 'No data yet' : $effectivenessRate . '%');
            $summaryCards = [
                ['label' => 'Total Notifications', 'value' => number_format($totalNotifications), 'meta' => 'visible backend records', 'tone' => 'purple'],
                ['label' => 'Delivered / Created', 'value' => number_format($deliveredNotifications), 'meta' => 'not failed in range', 'tone' => 'green'],
                ['label' => 'Open Rate', 'value' => $openRateText, 'meta' => $totalNotifications > 0 ? 'opened/read over total' : 'No data yet', 'tone' => 'blue'],
                ['label' => 'Effectiveness', 'value' => $effectivenessText, 'meta' => $totalNotifications > 0 ? 'actioned/completed over total' : 'No data yet', 'tone' => 'amber'],
                ['label' => 'Snoozed', 'value' => number_format($snoozedCount), 'meta' => $totalNotifications > 0 ? round(($snoozedCount / $totalNotifications) * 100, 1) . '% of total' : 'No data yet', 'tone' => 'amber'],
                ['label' => 'Failed', 'value' => number_format($failedCount), 'meta' => $totalNotifications > 0 ? round(($failedCount / $totalNotifications) * 100, 1) . '% of total' : 'No data yet', 'tone' => 'red'],
                ['label' => 'Avg Response Time', 'value' => $avgResponseMinutes === null ? '-' : $avgResponseMinutes . ' min', 'meta' => 'created/scheduled to interaction', 'tone' => 'slate'],
            ];
            $toneClasses = [
                'purple' => 'bg-purple-50 text-purple-700',
                'green' => 'bg-green-50 text-green-700',
                'blue' => 'bg-blue-50 text-blue-700',
                'amber' => 'bg-amber-50 text-amber-700',
                'red' => 'bg-red-50 text-red-700',
                'slate' => 'bg-slate-100 text-slate-700',
            ];
            $volumeRows = collect($notificationVolumeData)->take(-14)->values();
            $maxVolume = max(1, (int) ($volumeRows->max('count') ?? 0));
            $typeRows = collect($notificationTypeData);
            $maxType = max(1, (int) ($typeRows->max('count') ?? 0));
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

        <div class="rounded-xl border {{ ($hasBackendNotificationData ?? false) ? 'border-blue-100 bg-blue-50' : 'border-amber-100 bg-amber-50' }} px-4 py-3 mb-5">
            <p class="text-sm font-semibold {{ ($hasBackendNotificationData ?? false) ? 'text-blue-900' : 'text-amber-900' }}">Backend Data Scope</p>
            <p class="text-xs mt-1 {{ ($hasBackendNotificationData ?? false) ? 'text-blue-700' : 'text-amber-700' }}">{{ $notificationPersistenceNote ?? 'Admin analytics count backend-persisted notification records only.' }}</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <div class="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div class="px-4 py-3 border-b border-red-100 bg-red-50">
                    <h2 class="text-base font-bold text-red-900">Failed Notifications Log</h2>
                    <p class="text-xs text-red-700 mt-1">Only records with failed status or backend error details.</p>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Date</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">User</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Message</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Error</th>
                                <th class="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Action</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            @forelse($failedNotifications as $notif)
                            <tr class="hover:bg-slate-50">
                                <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ $notif['created_at']->format('M j, H:i') }}</td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm font-semibold text-slate-900">{{ $notif['user_name'] }}</td>
                                <td class="px-4 py-3 text-sm text-slate-600 max-w-sm truncate">{{ $notif['message'] }}</td>
                                <td class="px-4 py-3 text-sm text-slate-600">{{ $notif['error'] }}</td>
                                <td class="px-4 py-3 text-right"><a href="{{ route('admin.users.show', $notif['user_id']) }}" class="text-sm font-semibold text-blue-600 hover:text-blue-700">View</a></td>
                            </tr>
                            @empty
                            <tr><td colspan="5" class="px-4 py-5 text-center text-sm text-slate-500">No failed notifications in this range.</td></tr>
                            @endforelse
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h2 class="text-base font-bold text-slate-900">Engagement Status</h2>
                <p class="text-xs text-slate-500 mt-1">Opened/actioned state from persisted fields.</p>
                <div class="mt-4 space-y-4">
                    @foreach($engagementBreakdown as $item)
                    @php
                        $engagementPercent = max(0, min(100, (float) ($item['percent'] ?? 0)));
                        $engagementStyle = '--bar-width: ' . $engagementPercent . '%; width: var(--bar-width);';
                    @endphp
                    <div>
                        <div class="flex items-center justify-between gap-3">
                            <p class="text-sm font-semibold text-slate-700">{{ $item['label'] }}</p>
                            <p class="text-xs font-bold {{ $item['color'] === 'green' ? 'text-green-700' : ($item['color'] === 'blue' ? 'text-blue-700' : 'text-slate-600') }}">{{ $item['percent'] }}%</p>
                        </div>
                        <div class="mt-1.5 h-1.5 rounded-full bg-slate-100">
                            <div class="h-1.5 rounded-full {{ $item['color'] === 'green' ? 'bg-green-500' : ($item['color'] === 'blue' ? 'bg-blue-500' : 'bg-slate-400') }}" {!! 'style="' . e($engagementStyle) . '"' !!}></div>
                        </div>
                        <p class="text-xs text-slate-500 mt-1">{{ $item['count'] }} records</p>
                    </div>
                    @endforeach
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h2 class="text-base font-bold text-slate-900">Daily Notification Volume</h2>
                <p class="text-xs text-slate-500 mt-1">Last {{ $volumeRows->count() }} days shown.</p>
                @if($volumeRows->sum('count') > 0)
                <div class="mt-4 flex items-end gap-1 h-28 border-b border-slate-100">
                    @foreach($volumeRows as $point)
                    @php
                        $volumeHeight = max(4, min(100, round(((float) ($point['count'] ?? 0) / max(1, $maxVolume)) * 100)));
                        $volumeStyle = '--bar-height: ' . $volumeHeight . '%; height: var(--bar-height);';
                    @endphp
                    <div class="flex-1 flex flex-col items-center justify-end">
                        <div class="w-full rounded-t bg-purple-500/80" title="{{ $point['date'] }}: {{ $point['count'] }}" {!! 'style="' . e($volumeStyle) . '"' !!}></div>
                    </div>
                    @endforeach
                </div>
                <div class="mt-2 flex justify-between text-[11px] text-slate-400">
                    <span>{{ $volumeRows->first()['date'] ?? '' }}</span>
                    <span>{{ $volumeRows->last()['date'] ?? '' }}</span>
                </div>
                @else
                <div class="mt-4 rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No backend notification volume in this range.</div>
                @endif
            </div>

            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h2 class="text-base font-bold text-slate-900">Notification Types</h2>
                <p class="text-xs text-slate-500 mt-1">Hydration, medication, and general records.</p>
                <div class="mt-4 space-y-3">
                    @forelse($typeRows as $item)
                    @php
                        $typePercent = max(0, min(100, round(((float) ($item['count'] ?? 0) / max(1, $maxType)) * 100)));
                        $typeStyle = '--bar-width: ' . $typePercent . '%; width: var(--bar-width);';
                    @endphp
                    <div>
                        <div class="flex items-center justify-between gap-3">
                            <p class="text-sm font-semibold text-slate-700">{{ $item['type'] }}</p>
                            <p class="text-xs font-bold text-slate-700">{{ $item['count'] }}</p>
                        </div>
                        <div class="mt-1.5 h-1.5 rounded-full bg-slate-100"><div class="h-1.5 rounded-full bg-blue-500" {!! 'style="' . e($typeStyle) . '"' !!}></div></div>
                    </div>
                    @empty
                    <div class="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No notification types recorded.</div>
                    @endforelse
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h2 class="text-base font-bold text-slate-900">Effectiveness Score</h2>
                <p class="text-xs text-slate-500 mt-1">Actioned/completed records over total.</p>
                @if($effectivenessRate === null)
                <div class="mt-4 rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No data yet.</div>
                @else
                <div class="mt-4">
                    @php
                        $effectivenessPercent = max(0, min(100, (float) ($effectivenessRate ?? 0)));
                        $effectivenessStyle = '--bar-width: ' . $effectivenessPercent . '%; width: var(--bar-width);';
                    @endphp
                    <div class="flex items-end justify-between">
                        <p class="text-3xl font-bold text-slate-900">{{ $effectivenessRate }}%</p>
                        <p class="text-xs text-slate-500">{{ number_format($totalNotifications) }} total</p>
                    </div>
                    <div class="mt-3 h-2 rounded-full bg-slate-100"><div class="h-2 rounded-full bg-green-500" {!! 'style="' . e($effectivenessStyle) . '"' !!}></div></div>
                </div>
                @endif
            </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div>
                    <h2 class="text-base font-bold text-slate-900">Recent Notifications</h2>
                    <p class="text-xs text-slate-500 mt-1">Latest backend records, excluding hidden/cleared/deleted.</p>
                </div>
                <span class="text-xs text-slate-500">Latest {{ $recentNotifications->count() }}</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Date</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">User</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Message</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Type</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Interaction</th>
                            <th class="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Action</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        @forelse($recentNotifications as $notif)
                        <tr class="hover:bg-slate-50">
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ $notif['created_at']->format('M j, H:i') }}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm font-semibold text-slate-900">{{ $notif['user_name'] }}</td>
                            <td class="px-4 py-3 text-sm text-slate-600 max-w-sm truncate">{{ $notif['message'] }}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-xs font-semibold text-slate-600">{{ $notif['type'] }}</td>
                            <td class="px-4 py-3 whitespace-nowrap">
                                <span class="inline-flex px-2 py-1 rounded-full text-xs font-semibold {{ in_array($notif['status_key'], ['completed', 'actioned', 'taken', 'logged', 'delivered'], true) ? 'bg-green-100 text-green-700' : ($notif['status_key'] === 'failed' ? 'bg-red-100 text-red-700' : ($notif['status_key'] === 'snoozed' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700')) }}">{{ $notif['status'] }}</span>
                            </td>
                            <td class="px-4 py-3 whitespace-nowrap">
                                <span class="inline-flex px-2 py-1 rounded-full text-xs font-semibold {{ $notif['user_interaction'] === 'Opened & Actioned' ? 'bg-green-100 text-green-700' : ($notif['user_interaction'] === 'Opened Only' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700') }}">{{ $notif['user_interaction'] }}</span>
                            </td>
                            <td class="px-4 py-3 text-right"><a href="{{ route('admin.users.show', $notif['user_id']) }}" class="text-sm font-semibold text-blue-600 hover:text-blue-700">View</a></td>
                        </tr>
                        @empty
                        <tr><td colspan="7" class="px-4 py-6 text-center text-sm text-slate-500">No recent backend notifications in this range.</td></tr>
                        @endforelse
                    </tbody>
                </table>
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
