@extends('layouts.app')

@section('title', 'Create User')

@section('content')
<div class="min-h-screen bg-slate-50 py-3">
    <div class="max-w-4xl mx-auto px-4 sm:px-6">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-5">
            <div>
                <div class="flex items-center gap-2 text-sm mb-2">
                    <a href="{{ route('admin.users.index') }}" class="text-slate-500 hover:text-slate-700 font-medium">Users</a>
                    <span class="text-slate-400">/</span>
                    <span class="text-slate-900 font-medium">Create</span>
                </div>
                <h1 class="text-3xl font-bold text-slate-900">Create User</h1>
                <p class="text-slate-500 mt-1">Add a new IntakeSync account.</p>
            </div>
            <a href="{{ route('admin.users.index') }}" class="inline-flex items-center gap-2 border border-slate-200 text-slate-600 px-3 py-2 rounded-lg hover:bg-white font-medium text-sm">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                </svg>
                Back
            </a>
        </div>

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

        <div class="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100">
                <h2 class="text-base font-bold text-slate-900">Account Details</h2>
                <p class="text-xs text-slate-500 mt-1">Create the account with a role and temporary password.</p>
            </div>

            <form method="POST" action="{{ route('admin.users.store') }}" class="p-4 space-y-5">
                @csrf

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label for="name" class="block text-sm font-semibold text-slate-900 mb-1.5">Full Name <span class="text-red-600">*</span></label>
                        <input type="text" id="name" name="name" value="{{ old('name') }}" required autofocus class="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        @error('name')<p class="mt-1 text-sm text-red-600">{{ $message }}</p>@enderror
                    </div>

                    <div>
                        <label for="email" class="block text-sm font-semibold text-slate-900 mb-1.5">Email Address <span class="text-red-600">*</span></label>
                        <input type="email" id="email" name="email" value="{{ old('email') }}" required class="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        @error('email')<p class="mt-1 text-sm text-red-600">{{ $message }}</p>@enderror
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label for="password" class="block text-sm font-semibold text-slate-900 mb-1.5">Password <span class="text-red-600">*</span></label>
                        <input type="password" id="password" name="password" required class="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        @error('password')<p class="mt-1 text-sm text-red-600">{{ $message }}</p>@enderror
                    </div>

                    <div>
                        <label for="password_confirmation" class="block text-sm font-semibold text-slate-900 mb-1.5">Confirm Password <span class="text-red-600">*</span></label>
                        <input type="password" id="password_confirmation" name="password_confirmation" required class="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                </div>

                <div>
                    <label for="role" class="block text-sm font-semibold text-slate-900 mb-1.5">User Role <span class="text-red-600">*</span></label>
                    <select id="role" name="role" required class="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Select a role</option>
                        <option value="user" {{ old('role') === 'user' ? 'selected' : '' }}>User</option>
                        <option value="admin" {{ old('role') === 'admin' ? 'selected' : '' }}>Administrator</option>
                    </select>
                    @error('role')<p class="mt-1 text-sm text-red-600">{{ $message }}</p>@enderror
                </div>

                <div class="flex items-center gap-2 pt-4 border-t border-slate-100">
                    <a href="{{ route('admin.users.index') }}" class="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-sm">Cancel</a>
                    <button type="submit" class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium text-sm shadow-sm">Create User</button>
                </div>
            </form>
        </div>
    </div>
</div>
@endsection
