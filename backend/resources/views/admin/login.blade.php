@extends('layouts.auth')

@section('title', 'Admin Login')
@section('auth_heading', 'Admin Login')

@section('content')
@if ($errors->any())
<div class="mb-5 rounded-xl border border-red-500/30 bg-red-950/30 p-3 flex items-start gap-2">
    <svg class="w-5 h-5 text-red-300 mt-0.5 shrink-0" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <div>
        <h2 class="text-sm font-semibold text-red-200">Login Failed</h2>
        <p class="text-xs text-red-300 mt-1">{{ $errors->first() }}</p>
    </div>
</div>
@endif

@if (session('status'))
<div class="mb-5 rounded-xl border border-green-500/30 bg-green-950/30 p-3 flex items-start gap-2">
    <svg class="w-5 h-5 text-green-300 mt-0.5 shrink-0" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <div>
        <h2 class="text-sm font-semibold text-green-200">Success</h2>
        <p class="text-xs text-green-300 mt-1">{{ session('status') }}</p>
    </div>
</div>
@endif

@if (session('error'))
<div class="mb-5 rounded-xl border border-red-500/30 bg-red-950/30 p-3 flex items-start gap-2">
    <svg class="w-5 h-5 text-red-300 mt-0.5 shrink-0" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <div>
        <h2 class="text-sm font-semibold text-red-200">Error</h2>
        <p class="text-xs text-red-300 mt-1">{{ session('error') }}</p>
    </div>
</div>
@endif

<form method="POST" action="{{ route('admin.login') }}" id="loginForm" class="space-y-4">
    @csrf

    <div class="space-y-2">
        <label for="email" class="text-sm font-semibold text-slate-200">Email Address</label>
        <div class="relative">
            <div class="admin-field-icon" aria-hidden="true">
                <svg class="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
            </div>
            <input type="email" id="email" name="email" value="{{ old('email') }}" required autofocus placeholder="admin@intakesync.com" class="admin-field-input">
        </div>
        @error('email')<p class="text-xs text-red-300 mt-1">{{ $message }}</p>@enderror
    </div>

    <div class="space-y-2">
        <label for="password" class="text-sm font-semibold text-slate-200">Password</label>
        <div class="relative">
            <div class="admin-field-icon" aria-hidden="true">
                <svg class="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
            </div>
            <input type="password" id="password" name="password" required placeholder="Password" class="admin-field-input has-trailing-action">
            <button type="button" id="togglePassword" aria-label="Show password" class="absolute inset-y-0 right-0 w-12 flex items-center justify-center text-slate-500 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset rounded-r-xl">
                <svg id="eyeOpen" class="h-5 w-5" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <svg id="eyeClosed" class="h-5 w-5 hidden" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3l18 18" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.878 9.878a3 3 0 104.243 4.243" />
                </svg>
            </button>
        </div>
        @error('password')<p class="text-xs text-red-300 mt-1">{{ $message }}</p>@enderror
    </div>

    <div class="flex items-center justify-between gap-4 text-sm">
        <label class="inline-flex items-center gap-2.5 text-slate-200 cursor-pointer leading-none">
            <input type="checkbox" name="remember" class="h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0">
            <span>Remember me</span>
        </label>
        <a href="{{ route('admin.password.request') }}" class="text-blue-300 hover:text-blue-200 font-semibold">Forgot Password?</a>
    </div>

    <button type="submit" id="signinButton" class="auth-primary-button w-full flex justify-center items-center gap-2 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-slate-900 transition disabled:opacity-70 disabled:cursor-not-allowed">
        <span id="signinText">Sign In</span>
    </button>
</form>
@endsection

@push('scripts')
<script>
    IntakeSyncAuth.initPasswordToggle('togglePassword', 'password', 'eyeOpen', 'eyeClosed');
    IntakeSyncAuth.initSubmitLoading('loginForm', 'signinButton', 'signinText', 'Signing in...');
</script>
@endpush
