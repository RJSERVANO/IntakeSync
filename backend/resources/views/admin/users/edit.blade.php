@extends('layouts.app')

@section('title', 'Edit User - ' . $user->name)

@section('content')
<div class="min-h-screen bg-slate-50 py-3">
    <div class="max-w-6xl mx-auto px-4 sm:px-6">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-5">
            <div>
                <div class="flex items-center gap-2 text-sm mb-2">
                    <a href="{{ route('admin.users.index') }}" class="text-slate-500 hover:text-slate-700 font-medium">Users</a>
                    <span class="text-slate-400">/</span>
                    <a href="{{ route('admin.users.show', $user) }}" class="text-slate-500 hover:text-slate-700 font-medium">{{ $user->name }}</a>
                    <span class="text-slate-400">/</span>
                    <span class="text-slate-900 font-medium">Edit</span>
                </div>
                <h1 class="text-3xl font-bold text-slate-900">Edit User</h1>
                <p class="text-slate-500 mt-1">{{ $user->name }} · {{ $user->email }}</p>
            </div>
            <a href="{{ route('admin.users.show', $user) }}" class="inline-flex items-center gap-2 border border-slate-200 text-slate-600 px-3 py-2 rounded-lg hover:bg-white font-medium text-sm">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                </svg>
                Back
            </a>
        </div>

        @if (session('success'))
        <div class="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <p class="text-sm font-semibold text-green-900">Success</p>
            <p class="text-sm text-green-700 mt-1">{{ session('success') }}</p>
        </div>
        @endif

        @if ($errors->any())
        <div class="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p class="text-sm font-semibold text-red-900">Please fix the following errors:</p>
            <ul class="mt-2 space-y-1 text-sm text-red-700">
                @foreach ($errors->all() as $error)
                <li>{{ $error }}</li>
                @endforeach
            </ul>
        </div>
        @endif

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

        <div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-5">
            <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">User ID</p>
                    <p class="text-lg font-bold text-slate-900 mt-1">{{ $user->id }}</p>
                </div>
                <div>
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</p>
                    <span class="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold {{ $roleClass }}">{{ ucfirst($user->role) }}</span>
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

        <form id="passwordResetForm" method="POST" action="{{ route('admin.users.send-password-reset', $user) }}" class="hidden">
            @csrf
        </form>

        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div class="border-b border-slate-100 overflow-x-auto">
                <div class="flex min-w-max" role="tablist">
                    @foreach(['account' => 'Account Info', 'health' => 'Health', 'activity' => 'Activity'] as $tab => $label)
                    <button type="button" onclick="showEditTab('{{ $tab }}')" id="{{ $tab }}-tab" class="tab-button px-4 py-3 text-sm font-semibold border-b-2 transition-colors {{ $loop->first ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300' }}">{{ $label }}</button>
                    @endforeach
                </div>
            </div>

            <div id="account-tab-content" class="tab-content p-4">
                <form method="POST" action="{{ route('admin.users.update', $user) }}" class="space-y-5">
                    @csrf
                    @method('PUT')

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label for="status" class="block text-sm font-semibold text-slate-900 mb-1.5">Status <span class="text-red-600">*</span></label>
                            <select id="status" name="status" class="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="active" {{ $user->status === 'active' ? 'selected' : '' }}>Active</option>
                                <option value="suspended" {{ $user->status === 'suspended' ? 'selected' : '' }}>Suspended</option>
                                <option value="banned" {{ $user->status === 'banned' ? 'selected' : '' }}>Banned</option>
                                <option value="unverified" {{ $user->status === 'unverified' ? 'selected' : '' }}>Unverified</option>
                            </select>
                            @error('status')<p class="mt-1 text-sm text-red-600">{{ $message }}</p>@enderror
                        </div>

                        <div>
                            <label for="name" class="block text-sm font-semibold text-slate-900 mb-1.5">Full Name <span class="text-red-600">*</span></label>
                            <input type="text" id="name" name="name" value="{{ old('name', $user->name) }}" required class="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            @error('name')<p class="mt-1 text-sm text-red-600">{{ $message }}</p>@enderror
                        </div>

                        <div>
                            <label for="email" class="block text-sm font-semibold text-slate-900 mb-1.5">Email <span class="text-red-600">*</span></label>
                            <input type="email" id="email" name="email" value="{{ old('email', $user->email) }}" required class="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            @error('email')<p class="mt-1 text-sm text-red-600">{{ $message }}</p>@enderror
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label for="role" class="block text-sm font-semibold text-slate-900 mb-1.5">Role <span class="text-red-600">*</span></label>
                            <select id="role" name="role" required class="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="user" {{ $user->role === 'user' ? 'selected' : '' }}>User</option>
                                <option value="admin" {{ $user->role === 'admin' ? 'selected' : '' }}>Administrator</option>
                            </select>
                            @if ($user->id === auth()->id())
                            <p class="text-xs text-amber-600 mt-1">You are editing your own account. Be careful with role changes.</p>
                            @endif
                            @error('role')<p class="mt-1 text-sm text-red-600">{{ $message }}</p>@enderror
                        </div>

                        <div class="rounded-lg border border-blue-100 bg-blue-50 p-3">
                            <p class="text-sm font-semibold text-blue-900">Password Management</p>
                            <p class="text-xs text-blue-700 mt-1">Send a password reset email instead of setting a manual password.</p>
                            <button type="submit" form="passwordResetForm" class="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium text-sm shadow-sm">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                                </svg>
                                Send Reset Email
                            </button>
                        </div>
                    </div>

                    <div>
                        <label for="medical_history" class="block text-sm font-semibold text-slate-900 mb-1.5">Medical History Notes</label>
                        <textarea id="medical_history" name="medical_history" rows="4" class="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">{{ old('medical_history', $user->medical_history) }}</textarea>
                        @error('medical_history')<p class="mt-1 text-sm text-red-600">{{ $message }}</p>@enderror
                    </div>

                    <div class="flex items-center gap-2 pt-4 border-t border-slate-100">
                        <a href="{{ route('admin.users.show', $user) }}" class="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-sm">Cancel</a>
                        <button type="submit" class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium text-sm shadow-sm">Save Changes</button>
                    </div>
                </form>
            </div>

            <div id="health-tab-content" class="tab-content hidden p-4">
                <h2 class="text-base font-bold text-slate-900 mb-3">Health Profile</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="rounded-lg bg-slate-50 p-3">
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Weight</p>
                        <p class="text-lg font-bold text-slate-900 mt-1">{{ $user->weight ? $user->weight . ' ' . ($user->weight_unit ?? 'kg') : 'Not provided' }}</p>
                    </div>
                    <div class="rounded-lg bg-slate-50 p-3">
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Exercise Frequency</p>
                        <p class="text-lg font-bold text-slate-900 mt-1">{{ $user->exercise_frequency ? ucfirst($user->exercise_frequency) : 'Not provided' }}</p>
                    </div>
                    <div class="rounded-lg bg-slate-50 p-3">
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Climate</p>
                        <p class="text-lg font-bold text-slate-900 mt-1">{{ $user->climate ? ucfirst($user->climate) : 'Not provided' }}</p>
                    </div>
                    <div class="rounded-lg bg-slate-50 p-3">
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Daily Hydration Goal</p>
                        <p class="text-lg font-bold text-slate-900 mt-1">{{ $user->hydration_goal ? number_format($user->hydration_goal) . ' ml' : 'Not set' }}</p>
                    </div>
                    <div class="md:col-span-2 rounded-lg bg-slate-50 p-3">
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Medical History</p>
                        <p class="text-sm text-slate-700 mt-1">{{ $user->medical_history ?: 'No medical history has been recorded yet.' }}</p>
                    </div>
                </div>
            </div>

            <div id="activity-tab-content" class="tab-content hidden p-4">
                <h2 class="text-base font-bold text-slate-900 mb-3">Activity</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div class="rounded-lg bg-slate-50 p-3">
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Login</p>
                        <p class="text-sm font-semibold text-slate-900 mt-1">{{ $lastLogin ? $lastLogin->created_at->format('M j, Y H:i') : 'No explicit login event' }}</p>
                    </div>
                    <div class="rounded-lg bg-slate-50 p-3">
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Sync</p>
                        <p class="text-sm font-semibold text-slate-900 mt-1">{{ $user->last_sync_at ? $user->last_sync_at->format('M j, Y H:i') : 'Never' }}</p>
                    </div>
                    <div class="rounded-lg bg-slate-50 p-3">
                        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Latest App Version</p>
                        <p class="text-sm font-semibold text-slate-900 mt-1">{{ $user->last_app_version ?? 'Not recorded' }}</p>
                    </div>
                </div>

                <div class="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
                    @forelse($activityLogs as $log)
                    <div class="px-4 py-3 bg-white">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <p class="text-sm font-semibold text-slate-900">{{ ucfirst(str_replace('_', ' ', $log->activity_type)) }}</p>
                                @if($log->details)<p class="text-sm text-slate-600 mt-1">{{ $log->details }}</p>@endif
                                <p class="text-xs text-slate-500 mt-1">{{ $log->ip_address ? 'IP: ' . $log->ip_address : 'IP not recorded' }}{{ $log->app_version ? ' · Version: ' . $log->app_version : '' }}</p>
                            </div>
                            <p class="text-xs text-slate-500 whitespace-nowrap">{{ $log->created_at->format('M j, H:i') }}</p>
                        </div>
                    </div>
                    @empty
                    <div class="px-4 py-6 text-center text-sm text-slate-500 bg-white">No activity recorded yet.</div>
                    @endforelse
                </div>
            </div>
        </div>

        <div class="bg-red-50 rounded-xl border border-red-200 shadow-sm overflow-hidden mt-5">
            <div class="px-4 py-4">
                <h2 class="text-base font-bold text-red-900">Danger Zone</h2>
                <p class="text-sm text-red-700 mt-1 mb-4">Permanent actions that cannot be undone.</p>
                <form method="POST" action="{{ route('admin.users.destroy', $user) }}" onsubmit="return confirm('Are you absolutely sure you want to delete this user account? This action is irreversible.');">
                    @csrf
                    @method('DELETE')
                    @if ($user->id === auth()->id())
                    <div class="p-3 bg-red-100 rounded-lg border border-red-300 text-red-900 text-sm">You cannot delete your own account.</div>
                    @else
                    <button type="submit" class="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium text-sm shadow-sm inline-flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                        Delete Account
                    </button>
                    @endif
                </form>
            </div>
        </div>
    </div>
</div>

@push('scripts')
<script>
    function showEditTab(tabName) {
        document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.remove('border-blue-500', 'text-blue-600');
            button.classList.add('border-transparent', 'text-slate-600');
        });

        document.getElementById(tabName + '-tab-content')?.classList.remove('hidden');
        const selected = document.getElementById(tabName + '-tab');
        selected?.classList.add('border-blue-500', 'text-blue-600');
        selected?.classList.remove('border-transparent', 'text-slate-600');
    }
</script>
@endpush
@endsection
