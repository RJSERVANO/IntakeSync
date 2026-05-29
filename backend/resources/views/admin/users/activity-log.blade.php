@extends('layouts.app')

@section('title', 'Activity Log - ' . $user->name)

@section('content')
<div class="min-h-screen bg-slate-50 py-3">
    <div class="max-w-7xl mx-auto px-4 sm:px-6">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-5">
            <div>
                <div class="flex items-center gap-2 text-sm mb-2">
                    <a href="{{ route('admin.users.index') }}" class="text-slate-500 hover:text-slate-700 font-medium">Users</a>
                    <span class="text-slate-400">/</span>
                    <a href="{{ route('admin.users.show', $user) }}" class="text-slate-500 hover:text-slate-700 font-medium">{{ $user->name }}</a>
                    <span class="text-slate-400">/</span>
                    <span class="text-slate-900 font-medium">Activity Log</span>
                </div>
                <h1 class="text-3xl font-bold text-slate-900">Activity Log</h1>
                <p class="text-slate-500 mt-1">{{ $user->email }}</p>
            </div>
            <a href="{{ route('admin.users.show', $user) }}" class="inline-flex items-center gap-2 border border-slate-200 text-slate-600 px-3 py-2 rounded-lg hover:bg-white font-medium text-sm self-start">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                </svg>
                Back
            </a>
        </div>

        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100">
                <h2 class="text-base font-bold text-slate-900">Backend Activity Records</h2>
                <p class="text-xs text-slate-500 mt-1">Latest user activity persisted in the backend.</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Date</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Type</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Details</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">App Version</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">IP Address</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        @forelse($activityLogs as $log)
                        <tr class="hover:bg-slate-50">
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ $log->created_at ? $log->created_at->format('M j, Y g:i A') : '-' }}</td>
                            <td class="px-4 py-3 whitespace-nowrap">
                                <span class="inline-flex px-2 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">{{ \Illuminate\Support\Str::headline($log->activity_type) }}</span>
                            </td>
                            <td class="px-4 py-3 text-sm text-slate-600">{{ $log->details ?: '-' }}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ $log->app_version ?: '-' }}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ $log->ip_address ?: '-' }}</td>
                        </tr>
                        @empty
                        <tr><td colspan="5" class="px-4 py-6 text-center text-sm text-slate-500">No backend activity records found.</td></tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
            @if(method_exists($activityLogs, 'links'))
            <div class="px-4 py-3 border-t border-slate-100">
                {{ $activityLogs->links() }}
            </div>
            @endif
        </div>
    </div>
</div>
@endsection
