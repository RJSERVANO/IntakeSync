@extends('layouts.app')

@section('title', 'User Details - ' . $user->name)

@section('content')
<div class="min-h-screen bg-slate-50 py-3">
    <div class="max-w-7xl mx-auto px-4 sm:px-6">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-5">
            <div>
                <div class="flex items-center gap-2 text-sm mb-2">
                    <a href="{{ route('admin.users.index') }}" class="text-slate-500 hover:text-slate-700 font-medium">Users</a>
                    <span class="text-slate-400">/</span>
                    <span class="text-slate-900 font-medium">{{ $user->name }}</span>
                </div>
                <h1 class="text-3xl font-bold text-slate-900">{{ $user->name }}</h1>
                <p class="text-slate-500 mt-1">{{ $user->email }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
                <a href="{{ route('admin.users.edit', $user) }}" class="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 font-medium text-sm shadow-sm">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                    </svg>
                    Edit
                </a>
                <a href="{{ route('admin.users.index') }}" class="inline-flex items-center gap-2 border border-slate-200 text-slate-600 px-3 py-2 rounded-lg hover:bg-white font-medium text-sm">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                    </svg>
                    Back
                </a>
            </div>
        </div>

        @php
            $roleClass = $user->role === 'admin' ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-700';
            $statusClass = match($user->status ?? 'active') {
                'active' => 'bg-green-50 text-green-700',
                'suspended' => 'bg-amber-50 text-amber-700',
                'banned' => 'bg-red-50 text-red-700',
                'unverified' => 'bg-slate-100 text-slate-700',
                default => 'bg-slate-100 text-slate-700',
            };
            $summaryCards = [
                ['label' => 'Beverage Logs', 'value' => number_format($totalHydrationEntries), 'meta' => 'backend hydration entries', 'tone' => 'blue'],
                ['label' => 'Medication Records', 'value' => number_format($totalMedicationEntries), 'meta' => 'history records', 'tone' => 'teal'],
                ['label' => 'Notifications', 'value' => number_format($totalNotifications), 'meta' => 'backend records', 'tone' => 'purple'],
                ['label' => '7-Day Beverage Activity', 'value' => number_format($recentActivity), 'meta' => 'logs in last 7 days', 'tone' => 'green'],
            ];
            $toneClasses = [
                'blue' => 'bg-blue-50 text-blue-700',
                'teal' => 'bg-teal-50 text-teal-700',
                'purple' => 'bg-purple-50 text-purple-700',
                'green' => 'bg-green-50 text-green-700',
            ];
        @endphp

        <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-5">
            <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">User ID</p>
                    <p class="text-lg font-bold text-slate-900 mt-1">{{ $user->id }}</p>
                </div>
                <div>
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</p>
                    <span class="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold {{ $roleClass }}">
                        <span class="w-1.5 h-1.5 rounded-full {{ $user->role === 'admin' ? 'bg-blue-400' : 'bg-slate-400' }}"></span>
                        {{ ucfirst($user->role) }}
                    </span>
                </div>
                <div>
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</p>
                    <span class="mt-1 inline-flex px-2.5 py-1 rounded-full text-xs font-semibold {{ $statusClass }}">{{ ucfirst($user->status ?? 'active') }}</span>
                </div>
                <div>
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Member Since</p>
                    <p class="text-sm font-medium text-slate-700 mt-1">{{ $user->created_at->format('M j, Y') }}</p>
                </div>
                <div>
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Updated</p>
                    <p class="text-sm font-medium text-slate-700 mt-1">{{ $user->updated_at->format('M j, Y') }}</p>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            @foreach($summaryCards as $card)
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">{{ $card['label'] }}</p>
                        <p class="text-2xl font-bold text-slate-900 mt-2">{{ $card['value'] }}</p>
                    </div>
                    <span class="h-9 w-9 rounded-lg flex items-center justify-center {{ $toneClasses[$card['tone']] }}"><span class="h-2.5 w-2.5 rounded-full bg-current"></span></span>
                </div>
                <p class="text-xs text-slate-500 mt-3">{{ $card['meta'] }}</p>
            </div>
            @endforeach
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                @php
                    $hydrationProgressPercent = max(0, min(100, (float) ($hydrationTodayProgress ?? 0)));
                    $hydrationProgressStyle = '--bar-width: ' . $hydrationProgressPercent . '%; width: var(--bar-width);';
                @endphp
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Today's Beverage Progress</p>
                <p class="text-2xl font-bold text-slate-900 mt-2">{{ number_format($hydrationTodayTotal) }} ml</p>
                <p class="text-xs text-slate-500 mt-1">{{ $hydrationTodayProgress }}% of {{ number_format($hydrationGoal) }} ml goal</p>
                <div class="mt-3 h-2 rounded-full bg-slate-100"><div class="h-2 rounded-full bg-blue-500" {!! 'style="' . e($hydrationProgressStyle) . '"' !!}></div></div>
            </div>
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">30-Day Beverage Mix</p>
                <div class="mt-3 space-y-2">
                    @forelse($userBeverageBreakdown->take(3) as $item)
                    <div class="flex items-center justify-between gap-3">
                        <span class="text-sm font-medium {{ ($item['unsupported'] ?? false) ? 'text-red-700' : 'text-slate-700' }}">{{ $item['label'] }}</span>
                        <span class="text-sm font-semibold text-slate-900">{{ number_format($item['total_ml']) }} ml</span>
                    </div>
                    @empty
                    <p class="text-sm text-slate-500">No beverage logs in the last 30 days.</p>
                    @endforelse
                </div>
            </div>
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Caffeine/Sugar Awareness</p>
                <p class="text-2xl font-bold text-slate-900 mt-2">{{ number_format($userAwarenessFlags) }}</p>
                <p class="text-xs text-slate-500 mt-1">medium or high logs in 30 days</p>
            </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div class="border-b border-slate-100 overflow-x-auto">
                <div class="flex min-w-max" role="tablist" aria-label="User backend activity">
                    @foreach(['hydration' => 'Hydration', 'medication' => 'Medications', 'notifications' => 'Notifications'] as $tab => $label)
                    <button type="button" onclick="showUserTab('{{ $tab }}')" id="{{ $tab }}-tab" class="tab-button px-4 py-3 text-sm font-semibold border-b-2 transition-colors {{ $loop->first ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300' }}">{{ $label }}</button>
                    @endforeach
                </div>
            </div>

            <div id="hydration-content" class="tab-content p-4">
                <h2 class="text-base font-bold text-slate-900 mb-3">Recent Beverage Entries</h2>
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-slate-50 border-y border-slate-100">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Drink</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Amount</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Sugar</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Caffeine</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Source</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Date</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            @forelse($hydrationEntries as $entry)
                            <tr class="hover:bg-slate-50">
                                <td class="px-4 py-3 text-sm"><p class="font-semibold text-slate-900">{{ $entry->drink_label ?: \Illuminate\Support\Str::headline($entry->beverage_type ?: 'water') }}</p><p class="text-xs text-slate-500">{{ \Illuminate\Support\Str::headline($entry->beverage_type ?: 'water') }}</p></td>
                                <td class="px-4 py-3 text-sm font-semibold text-slate-900">{{ number_format($entry->amount_ml) }} ml</td>
                                <td class="px-4 py-3 text-sm text-slate-600">{{ \Illuminate\Support\Str::headline($entry->sugar_level ?: 'none') }}</td>
                                <td class="px-4 py-3 text-sm text-slate-600">{{ \Illuminate\Support\Str::headline($entry->caffeine_level ?: 'none') }}</td>
                                <td class="px-4 py-3 text-sm text-slate-600">{{ \Illuminate\Support\Str::headline($entry->source ?: 'manual') }}</td>
                                <td class="px-4 py-3 text-sm text-slate-600">{{ $entry->created_at->format('M j, Y g:i A') }}</td>
                            </tr>
                            @empty
                            <tr><td colspan="6" class="px-4 py-6 text-center text-sm text-slate-500">No beverage entries found.</td></tr>
                            @endforelse
                        </tbody>
                    </table>
                </div>
            </div>

            <div id="medication-content" class="tab-content hidden p-4">
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div class="lg:col-span-1">
                        <h2 class="text-base font-bold text-slate-900 mb-3">Active Medications</h2>
                        <div class="space-y-2">
                            @forelse($medications as $medication)
                            <div class="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                <p class="text-sm font-semibold text-slate-900">{{ $medication->name }}</p>
                                <p class="text-xs text-slate-500">{{ $medication->dosage ?: 'No dosage' }} · {{ $medication->frequency ?: 'daily' }}</p>
                            </div>
                            @empty
                            <div class="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No active medications.</div>
                            @endforelse
                        </div>
                    </div>
                    <div class="lg:col-span-2 overflow-x-auto">
                        <h2 class="text-base font-bold text-slate-900 mb-3">Recent Medication History</h2>
                        <table class="w-full">
                            <thead class="bg-slate-50 border-y border-slate-100">
                                <tr>
                                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Medication</th>
                                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</th>
                                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Scheduled</th>
                                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Taken</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                @forelse($medicationHistory as $history)
                                @php $status = strtolower((string) $history->status); @endphp
                                <tr class="hover:bg-slate-50">
                                    <td class="px-4 py-3 text-sm font-semibold text-slate-900">{{ $history->medication_name_snapshot ?: ($history->medication->name ?? 'Unknown') }}</td>
                                    <td class="px-4 py-3"><span class="inline-flex px-2 py-1 rounded-full text-xs font-semibold {{ in_array($status, ['taken', 'completed'], true) ? 'bg-green-100 text-green-700' : (in_array($status, ['missed', 'skipped'], true) ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700') }}">{{ ucfirst($status) }}</span></td>
                                    <td class="px-4 py-3 text-sm text-slate-600">{{ $history->scheduled_time ? \Carbon\Carbon::parse($history->scheduled_time)->format('M j, Y g:i A') : '-' }}</td>
                                    <td class="px-4 py-3 text-sm text-slate-600">{{ $history->taken_time ? \Carbon\Carbon::parse($history->taken_time)->format('M j, Y g:i A') : '-' }}</td>
                                </tr>
                                @empty
                                <tr><td colspan="4" class="px-4 py-6 text-center text-sm text-slate-500">No medication history found.</td></tr>
                                @endforelse
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div id="notifications-content" class="tab-content hidden p-4">
                <h2 class="text-base font-bold text-slate-900 mb-3">Recent Notifications</h2>
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-slate-50 border-y border-slate-100">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Type</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Title</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Created</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            @forelse($notifications as $notification)
                            <tr class="hover:bg-slate-50">
                                <td class="px-4 py-3 text-sm font-semibold text-slate-900">{{ ucfirst($notification->type) }}</td>
                                <td class="px-4 py-3 text-sm text-slate-600">{{ $notification->title }}</td>
                                <td class="px-4 py-3"><span class="inline-flex px-2 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">{{ ucfirst($notification->status) }}</span></td>
                                <td class="px-4 py-3 text-sm text-slate-600">{{ $notification->created_at->format('M j, Y g:i A') }}</td>
                            </tr>
                            @empty
                            <tr><td colspan="4" class="px-4 py-6 text-center text-sm text-slate-500">No notifications found.</td></tr>
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
    function showUserTab(tabName) {
        document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.remove('border-blue-500', 'text-blue-600');
            button.classList.add('border-transparent', 'text-slate-600');
        });

        document.getElementById(tabName + '-content')?.classList.remove('hidden');
        const selected = document.getElementById(tabName + '-tab');
        selected?.classList.add('border-blue-500', 'text-blue-600');
        selected?.classList.remove('border-transparent', 'text-slate-600');
    }
</script>
@endpush
@endsection
