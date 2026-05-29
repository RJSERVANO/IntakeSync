@extends('layouts.auth')

@section('title', 'Forgot Password')
@section('auth_heading', 'Reset Password')
@section('auth_subheading', 'Enter your admin email and we will send a secure reset link.')

@section('content')
@if ($errors->any())
<div class="mb-5 rounded-xl border border-red-500/30 bg-red-950/30 p-3 flex items-start gap-2">
    <svg class="w-5 h-5 text-red-300 mt-0.5 shrink-0" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <div>
        <h2 class="text-sm font-semibold text-red-200">Error</h2>
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

<form method="POST" action="{{ route('admin.password.email') }}" id="forgotPasswordForm" class="space-y-4">
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

    <button type="submit" id="submitBtn" class="auth-primary-button w-full flex justify-center items-center gap-2 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-slate-900 transition disabled:opacity-70 disabled:cursor-not-allowed">
        <span id="submitText">Send Reset Link</span>
    </button>

    <div class="text-center pt-1">
        <a href="{{ route('admin.login') }}" class="text-sm text-blue-300 hover:text-blue-200 font-semibold">Back to Login</a>
    </div>
</form>
@endsection

@push('scripts')
<script>
    IntakeSyncAuth.initSubmitLoading('forgotPasswordForm', 'submitBtn', 'submitText', 'Sending...');
</script>
@endpush
