@extends('layouts.app')

@section('title', 'Users Management')

@section('content')
<div class="min-h-screen bg-slate-50 py-3">
    <div class="max-w-7xl mx-auto px-4 sm:px-6">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-5">
            <div>
                <h1 class="text-3xl font-bold text-slate-900">User Management</h1>
                <p class="text-slate-500 mt-1">Manage platform users and admin access.</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
                <button type="button" disabled title="Filter controls are not configured yet" class="inline-flex items-center gap-2 px-3 py-2 text-slate-400 border border-slate-200 rounded-lg bg-slate-50 font-medium text-sm cursor-not-allowed">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                    </svg>
                    Filter
                </button>
                <button type="button" disabled title="Export is not configured yet" class="inline-flex items-center gap-2 px-3 py-2 text-slate-400 border border-slate-200 rounded-lg bg-slate-50 font-medium text-sm cursor-not-allowed">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3v-6"></path>
                    </svg>
                    Export
                </button>
                <a href="{{ route('admin.users.create') }}" class="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                    </svg>
                    Add User
                </a>
            </div>
        </div>

        @php
            $totalUsers = $users->total();
            $pageUsers = collect($users->items());
            $adminCount = $pageUsers->where('role', 'admin')->count();
            $standardCount = $pageUsers->where('role', '!=', 'admin')->count();
            $activeCount = $pageUsers->where('status', 'active')->count();
            $summaryCards = [
                ['label' => 'Total Users', 'value' => number_format($totalUsers), 'meta' => 'all matching records', 'tone' => 'blue'],
                ['label' => 'Visible This Page', 'value' => number_format($pageUsers->count()), 'meta' => 'current paginated page', 'tone' => 'slate'],
                ['label' => 'Admins On Page', 'value' => number_format($adminCount), 'meta' => 'administrator role', 'tone' => 'purple'],
                ['label' => 'Active On Page', 'value' => number_format($activeCount), 'meta' => $standardCount . ' standard users shown', 'tone' => 'green'],
            ];
            $toneClasses = [
                'blue' => 'bg-blue-50 text-blue-700',
                'slate' => 'bg-slate-100 text-slate-700',
                'purple' => 'bg-purple-50 text-purple-700',
                'green' => 'bg-green-50 text-green-700',
            ];
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

        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 class="text-base font-bold text-slate-900">Users</h2>
                    <p class="text-xs text-slate-500 mt-1">Showing {{ $users->firstItem() ?? 0 }}-{{ $users->lastItem() ?? 0 }} of {{ $users->total() }} users.</p>
                </div>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Name</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Email</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Role</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Joined</th>
                            <th class="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        @forelse ($users as $user)
                        @php
                            $roleClass = $user->role === 'admin' ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-700';
                            $statusClass = match($user->status ?? 'active') {
                                'active' => 'bg-green-50 text-green-700',
                                'suspended' => 'bg-amber-50 text-amber-700',
                                'banned' => 'bg-red-50 text-red-700',
                                'unverified' => 'bg-slate-100 text-slate-700',
                                default => 'bg-slate-100 text-slate-700',
                            };
                        @endphp
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-4 py-3 whitespace-nowrap">
                                <a href="{{ route('admin.users.show', $user) }}" class="text-sm font-semibold text-blue-600 hover:text-blue-700">{{ $user->name }}</a>
                            </td>
                            <td class="px-4 py-3 text-sm text-slate-600">{{ $user->email }}</td>
                            <td class="px-4 py-3 whitespace-nowrap">
                                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold {{ $roleClass }}">
                                    <span class="w-1.5 h-1.5 rounded-full {{ $user->role === 'admin' ? 'bg-blue-400' : 'bg-slate-400' }}"></span>
                                    {{ ucfirst($user->role) }}
                                </span>
                            </td>
                            <td class="px-4 py-3 whitespace-nowrap">
                                <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold {{ $statusClass }}">{{ ucfirst($user->status ?? 'active') }}</span>
                            </td>
                            <td class="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{{ $user->created_at->format('M j, Y') }}</td>
                            <td class="px-4 py-3 text-right whitespace-nowrap">
                                <div class="inline-flex items-center gap-1">
                                    <a href="{{ route('admin.users.show', $user) }}" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="View">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                                        </svg>
                                    </a>
                                    <a href="{{ route('admin.users.edit', $user) }}" class="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Edit">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                                        </svg>
                                    </a>
                                    @if ($user->id !== auth()->id())
                                    <form method="POST" action="{{ route('admin.users.destroy', $user) }}" class="inline" onsubmit="return confirm('Are you sure you want to delete this user?');">
                                        @csrf
                                        @method('DELETE')
                                        <button type="submit" class="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                            </svg>
                                        </button>
                                    </form>
                                    @endif
                                </div>
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="6" class="px-4 py-8 text-center text-sm text-slate-500">No users found.</td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>

            <div class="px-4 py-3 border-t border-slate-100 bg-slate-50">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div class="text-sm text-slate-600">
                        Showing {{ $users->firstItem() ?? 0 }} to {{ $users->lastItem() ?? 0 }} of {{ $users->total() }} users
                    </div>
                    <div class="flex items-center gap-2">
                        {{ $users->links() }}
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
@endsection
