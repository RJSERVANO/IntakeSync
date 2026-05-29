@extends('layouts.app')

@section('title', 'User Details - ' . $user->name)

@section('content')
<div class="min-h-screen bg-slate-50 py-3">
    <div class="max-w-7xl mx-auto px-4 sm:px-6">
        <!-- Page Header -->
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-5">
            <div>
                <div class="flex items-center gap-3 mb-2">
                    <a href="{{ route('admin.users.index') }}" class="text-slate-500 hover:text-slate-700 font-medium">Users</a>
                    <span class="text-slate-400">/</span>
                    <span class="text-slate-900 font-medium">{{ $user->name }}</span>
                </div>
                <h1 class="text-3xl font-bold text-slate-900">{{ $user->name }}</h1>
                <p class="text-slate-500 mt-1">{{ $user->email }}</p>
            </div>
            <div class="flex items-center gap-3">
                <a href="{{ route('admin.users.edit', $user) }}" class="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                    </svg>
                    Edit User
                </a>
                <a href="{{ route('admin.users.index') }}" class="flex items-center gap-2 border border-slate-200 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                    </svg>
                    Back
                </a>
            </div>
        </div>

        <!-- User Info Card -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden mb-5">
            <div class="px-6 py-5 grid grid-cols-2 md:grid-cols-5 gap-5">
                <div>
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</p>
                    <p class="text-lg font-semibold text-slate-900 mt-2">{{ $user->name }}</p>
                </div>
                <div>
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</p>
                    <p class="text-sm font-medium text-slate-600 mt-2 break-all">{{ $user->email }}</p>
                </div>
                <div>
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</p>
                    <div class="mt-2">
                        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold {{ $user->role === 'admin' ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-700' }}">
                            <span class="w-2 h-2 rounded-full {{ $user->role === 'admin' ? 'bg-blue-400' : 'bg-slate-400' }}"></span>
                            {{ ucfirst($user->role) }}
                        </span>
                    </div>
                </div>
                <div>
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Member Since</p>
                    <p class="text-sm font-medium text-slate-600 mt-2">{{ $user->created_at->format('M j, Y') }}</p>
                </div>
            </div>
        </div>

        <!-- Stats Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow">
                <div class="flex items-center gap-4">
                    <div class="p-3 bg-blue-50 rounded-lg">
                        <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 21a7 7 0 007-7c0-4.5-4.6-9.4-6.4-11.2a.85.85 0 00-1.2 0C9.6 4.6 5 9.5 5 14a7 7 0 007 7z"></path>
                        </svg>
                    </div>
                    <div>
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Beverage Logs</p>
                        <p class="text-2xl font-bold text-slate-900 mt-1">{{ $totalHydrationEntries }}</p>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow">
                <div class="flex items-center gap-4">
                    <div class="p-3 bg-green-50 rounded-lg">
                        <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 21h4m-2-4v4m-4-4h8a2 2 0 002-2V7a4 4 0 00-4-4h-4a4 4 0 00-4 4v8a2 2 0 002 2zm4-12v8m-4-4h8"></path>
                        </svg>
                    </div>
                    <div>
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Medications</p>
                        <p class="text-2xl font-bold text-slate-900 mt-1">{{ $totalMedicationEntries }}</p>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow">
                <div class="flex items-center gap-4">
                    <div class="p-3 bg-purple-50 rounded-lg">
                        <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 01-6 0"></path>
                        </svg>
                    </div>
                    <div>
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notifications</p>
                        <p class="text-2xl font-bold text-slate-900 mt-1">{{ $totalNotifications }}</p>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow">
                <div class="flex items-center gap-4">
                    <div class="p-3 bg-amber-50 rounded-lg">
                        <svg class="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                        </svg>
                    </div>
                    <div>
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Activity</p>
                        <p class="text-2xl font-bold text-slate-900 mt-1">{{ $recentActivity }}</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Today's Beverage Progress</p>
                <p class="text-3xl font-bold text-slate-900 mt-2">{{ number_format($hydrationTodayTotal) }} ml</p>
                <p class="text-sm text-slate-600 mt-1">{{ $hydrationTodayProgress }}% of {{ number_format($hydrationGoal) }} ml goal</p>
                <div class="mt-4 w-full bg-slate-200 rounded-full h-2">
                    <div class="bg-blue-600 h-2 rounded-full" style="width: {{ min($hydrationTodayProgress, 100) }}%"></div>
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">30-Day Beverage Mix</p>
                <div class="mt-4 space-y-3">
                    @forelse($userBeverageBreakdown->take(3) as $item)
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-medium text-slate-700">{{ $item['label'] }}</span>
                        <span class="text-sm font-semibold text-slate-900">{{ number_format($item['total_ml']) }} ml</span>
                    </div>
                    @empty
                    <p class="text-sm text-slate-500">No beverage logs in the last 30 days.</p>
                    @endforelse
                </div>
            </div>

            <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Caffeine/Sugar Awareness</p>
                <p class="text-3xl font-bold text-slate-900 mt-2">{{ number_format($userAwarenessFlags) }}</p>
                <p class="text-sm text-slate-600 mt-1">medium or high caffeine/sugar logs in 30 days</p>
            </div>
        </div>

        <!-- Tabs -->
        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <!-- Tab Navigation -->
            <div class="border-b border-slate-100 overflow-x-auto">
                <div class="flex min-w-max md:min-w-0" role="tablist" aria-label="User activity details">
                    <button type="button" onclick="showTab('hydration')" id="hydration-tab" role="tab" aria-controls="hydration-content" aria-selected="true" class="tab-button flex-1 md:flex-none px-6 py-4 text-sm font-semibold border-b-2 transition-colors active-tab border-blue-500 text-blue-600">
                        <span class="flex items-center gap-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 21a7 7 0 007-7c0-4.5-4.6-9.4-6.4-11.2a.85.85 0 00-1.2 0C9.6 4.6 5 9.5 5 14a7 7 0 007 7z"></path>
                            </svg>
                            Hydration
                        </span>
                    </button>
                    <button type="button" onclick="showTab('medication')" id="medication-tab" role="tab" aria-controls="medication-content" aria-selected="false" class="tab-button flex-1 md:flex-none px-6 py-4 text-sm font-semibold text-slate-600 border-b-2 border-transparent hover:text-slate-900 hover:border-slate-300 transition-colors">
                        <span class="flex items-center gap-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 21h4m-2-4v4m-4-4h8a2 2 0 002-2V7a4 4 0 00-4-4h-4a4 4 0 00-4 4v8a2 2 0 002 2zm4-12v8m-4-4h8"></path>
                            </svg>
                            Medications
                        </span>
                    </button>
                    <button type="button" onclick="showTab('notifications')" id="notifications-tab" role="tab" aria-controls="notifications-content" aria-selected="false" class="tab-button flex-1 md:flex-none px-6 py-4 text-sm font-semibold text-slate-600 border-b-2 border-transparent hover:text-slate-900 hover:border-slate-300 transition-colors">
                        <span class="flex items-center gap-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 01-6 0"></path>
                            </svg>
                            Notifications
                        </span>
                    </button>
                </div>
            </div>

            <!-- Hydration Tab -->
            <div id="hydration-content" class="tab-content p-6" role="tabpanel" aria-labelledby="hydration-tab">
                <h3 class="text-lg font-semibold text-slate-900 mb-6">Recent Beverage Entries</h3>
                @if($hydrationEntries->count() > 0)
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead>
                            <tr class="border-b border-slate-200">
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Drink</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Amount</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Sugar</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Caffeine</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Source</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            @foreach($hydrationEntries as $entry)
                            <tr class="hover:bg-slate-50 transition-colors">
                                <td class="px-4 py-3 text-sm">
                                    <p class="font-medium text-slate-900">{{ $entry->drink_label ?: \Illuminate\Support\Str::headline($entry->beverage_type ?: 'water') }}</p>
                                    <p class="text-xs text-slate-500">{{ \Illuminate\Support\Str::headline($entry->beverage_type ?: 'water') }}</p>
                                </td>
                                <td class="px-4 py-3 text-sm font-medium text-slate-900">{{ number_format($entry->amount_ml) }} ml</td>
                                <td class="px-4 py-3 text-sm text-slate-600">{{ \Illuminate\Support\Str::headline($entry->sugar_level ?: 'none') }}</td>
                                <td class="px-4 py-3 text-sm text-slate-600">{{ \Illuminate\Support\Str::headline($entry->caffeine_level ?: 'none') }}</td>
                                <td class="px-4 py-3 text-sm text-slate-600">{{ \Illuminate\Support\Str::headline($entry->source ?: 'manual') }}</td>
                                <td class="px-4 py-3 text-sm text-slate-600">{{ $entry->created_at->format('M j, Y g:i A') }}</td>
                            </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
                @else
                <p class="text-center text-slate-500 py-8">No beverage entries found.</p>
                @endif
            </div>

            <!-- Medication Tab -->
            <div id="medication-content" class="tab-content hidden p-6" role="tabpanel" aria-labelledby="medication-tab">
                <h3 class="text-lg font-semibold text-slate-900 mb-6">Active Medications</h3>
                @if($medications->count() > 0)
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    @foreach($medications as $medication)
                    <div class="border border-slate-200 rounded-lg p-4 hover:border-slate-300 hover:shadow-sm transition">
                        <h4 class="font-semibold text-slate-900">{{ $medication->name }}</h4>
                        <div class="mt-3 space-y-2 text-sm text-slate-600">
                            <p><span class="font-medium">Dosage:</span> {{ $medication->dosage }}</p>
                            <p><span class="font-medium">Frequency:</span> {{ $medication->frequency }}</p>
                            <p><span class="font-medium">Start Date:</span> {{ $medication->start_date ? \Carbon\Carbon::parse($medication->start_date)->format('M j, Y') : 'N/A' }}</p>
                        </div>
                    </div>
                    @endforeach
                </div>
                @endif

                <h3 class="text-lg font-semibold text-slate-900 mb-6">Recent Medication History</h3>
                @if($medicationHistory->count() > 0)
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead>
                            <tr class="border-b border-slate-200">
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Medication</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Dosage</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Scheduled</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Taken</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            @foreach($medicationHistory as $history)
                            <tr class="hover:bg-slate-50 transition-colors">
                                <td class="px-4 py-3 text-sm font-medium text-slate-900">{{ $history->medication_name_snapshot ?: ($history->medication->name ?? 'Unknown') }}</td>
                                <td class="px-4 py-3 text-sm text-slate-600">{{ $history->dosage_snapshot ?: ($history->medication->dosage ?? '-') }}</td>
                                <td class="px-4 py-3 text-sm">
                                    @php
                                    $statusColor = in_array($history->status, ['taken', 'completed'], true) ? 'text-green-600' :
                                    (in_array($history->status, ['missed', 'skipped'], true) ? 'text-red-600' : 'text-amber-600');
                                    @endphp
                                    <span class="{{ $statusColor }} font-semibold">{{ ucfirst($history->status) }}</span>
                                </td>
                                <td class="px-4 py-3 text-sm text-slate-600">{{ \Carbon\Carbon::parse($history->scheduled_time)->format('M j, Y g:i A') }}</td>
                                <td class="px-4 py-3 text-sm text-slate-600">{{ $history->taken_time ? \Carbon\Carbon::parse($history->taken_time)->format('M j, Y g:i A') : '-' }}</td>
                            </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
                @else
                <p class="text-center text-slate-500 py-8">No medication history found.</p>
                @endif
            </div>

            <!-- Notifications Tab -->
            <div id="notifications-content" class="tab-content hidden p-6" role="tabpanel" aria-labelledby="notifications-tab">
                <h3 class="text-lg font-semibold text-slate-900 mb-6">Recent Notifications</h3>
                @if($notifications->count() > 0)
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead>
                            <tr class="border-b border-slate-200">
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Type</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Title</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Scheduled</th>
                                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Created</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            @foreach($notifications as $notification)
                            <tr class="hover:bg-slate-50 transition-colors">
                                <td class="px-4 py-3 text-sm text-slate-900 font-medium">{{ ucfirst($notification->type) }}</td>
                                <td class="px-4 py-3 text-sm text-slate-600">{{ $notification->title }}</td>
                                <td class="px-4 py-3 text-sm">
                                    @php
                                    $statusColor = $notification->status === 'delivered' ? 'text-green-600' :
                                    ($notification->status === 'missed' ? 'text-red-600' :
                                    ($notification->status === 'snoozed' ? 'text-amber-600' : 'text-blue-600'));
                                    @endphp
                                    <span class="{{ $statusColor }} font-semibold">{{ ucfirst($notification->status) }}</span>
                                </td>
                                <td class="px-4 py-3 text-sm text-slate-600">{{ $notification->scheduled_time ? \Carbon\Carbon::parse($notification->scheduled_time)->format('M j, Y g:i A') : '-' }}</td>
                                <td class="px-4 py-3 text-sm text-slate-600">{{ $notification->created_at->format('M j, Y g:i A') }}</td>
                            </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
                @else
                <p class="text-center text-slate-500 py-8">No notifications found.</p>
                @endif
            </div>
        </div>
    </div>
</div>
@endsection

@push('scripts')
<script>
    function showTab(tabName) {
        const selectedContent = document.getElementById(tabName + '-content');
        const selectedButton = document.getElementById(tabName + '-tab');

        if (!selectedContent || !selectedButton) {
            return;
        }

        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });

        // Remove active class from all tab buttons
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.remove('active-tab', 'border-blue-500', 'text-blue-600');
            button.classList.add('border-transparent', 'text-slate-600');
            button.setAttribute('aria-selected', 'false');
        });

        // Show selected tab content
        selectedContent.classList.remove('hidden');

        // Add active class to selected tab button
        selectedButton.classList.add('active-tab', 'border-blue-500', 'text-blue-600');
        selectedButton.classList.remove('border-transparent', 'text-slate-600');
        selectedButton.setAttribute('aria-selected', 'true');
    }
</script>
@endpush
