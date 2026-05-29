@extends('layouts.auth')

@section('title', 'Reset Password')
@section('auth_heading', 'Set New Password')
@section('auth_subheading', 'Create a new password for your admin account.')

@section('content')
@if ($errors->any())
<div class="mb-5 rounded-xl border border-red-500/30 bg-red-950/30 p-3 flex items-start gap-2">
    <svg class="w-5 h-5 text-red-300 mt-0.5 shrink-0" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <div>
        <h2 class="text-sm font-semibold text-red-200">Error</h2>
        <ul class="text-xs text-red-300 mt-1 space-y-1">
            @foreach ($errors->all() as $error)
            <li>{{ $error }}</li>
            @endforeach
        </ul>
    </div>
</div>
@endif

<form method="POST" action="{{ route('admin.password.update') }}" id="resetForm" class="space-y-4">
    @csrf

    <input type="hidden" name="token" value="{{ $token }}">
    <input type="hidden" name="email" value="{{ $email ?? old('email') }}">

    <div class="space-y-2">
        <label for="email_display" class="text-sm font-semibold text-slate-200">Email Address</label>
        <div class="relative">
            <div class="admin-field-icon" aria-hidden="true">
                <svg class="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
            </div>
            <input type="email" id="email_display" value="{{ $email ?? old('email') }}" readonly class="admin-field-input">
        </div>
    </div>

    <div class="space-y-2">
        <label for="password" class="text-sm font-semibold text-slate-200">New Password</label>
        <div class="relative">
            <div class="admin-field-icon" aria-hidden="true">
                <svg class="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
            </div>
            <input type="password" id="password" name="password" required placeholder="Password" aria-describedby="passwordHelp passwordMatchMessage" class="admin-field-input has-trailing-action">
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
        <p id="passwordHelp" class="text-xs text-slate-400">Use at least 8 characters.</p>
        @error('password')<p class="text-xs text-red-300 mt-1">{{ $message }}</p>@enderror
    </div>

    <div class="space-y-2">
        <label for="password_confirmation" class="text-sm font-semibold text-slate-200">Confirm Password</label>
        <div class="relative">
            <div class="admin-field-icon" aria-hidden="true">
                <svg class="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
            </div>
            <input type="password" id="password_confirmation" name="password_confirmation" required placeholder="Confirm password" aria-describedby="passwordMatchMessage" class="admin-field-input has-trailing-action">
            <button type="button" id="togglePasswordConfirmation" aria-label="Show password confirmation" class="absolute inset-y-0 right-0 w-12 flex items-center justify-center text-slate-500 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset rounded-r-xl">
                <svg id="eyeOpenConfirm" class="h-5 w-5" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <svg id="eyeClosedConfirm" class="h-5 w-5 hidden" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3l18 18" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.878 9.878a3 3 0 104.243 4.243" />
                </svg>
            </button>
        </div>
        <p id="passwordMatchMessage" class="text-xs text-amber-300 hidden">Passwords do not match yet.</p>
    </div>

    <button type="submit" id="submitBtn" class="auth-primary-button w-full flex justify-center items-center gap-2 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-slate-900 transition disabled:opacity-70 disabled:cursor-not-allowed">
        <span id="submitText">Reset Password</span>
    </button>

    <div class="text-center pt-1">
        <a href="{{ route('admin.login') }}" class="text-sm text-blue-300 hover:text-blue-200 font-semibold">Back to Login</a>
    </div>
</form>
@endsection

@push('scripts')
<script>
    IntakeSyncAuth.initPasswordToggle('togglePassword', 'password', 'eyeOpen', 'eyeClosed');
    IntakeSyncAuth.initPasswordToggle('togglePasswordConfirmation', 'password_confirmation', 'eyeOpenConfirm', 'eyeClosedConfirm');
    IntakeSyncAuth.initSubmitLoading('resetForm', 'submitBtn', 'submitText', 'Resetting password...');

    (function() {
        const password = document.getElementById('password');
        const confirmation = document.getElementById('password_confirmation');
        const message = document.getElementById('passwordMatchMessage');

        function updateMatchMessage() {
            if (!password || !confirmation || !message) {
                return;
            }

            const shouldShow = confirmation.value.length > 0 && password.value !== confirmation.value;
            message.classList.toggle('hidden', !shouldShow);
        }

        password?.addEventListener('input', updateMatchMessage);
        confirmation?.addEventListener('input', updateMatchMessage);
    })();
</script>
@endpush
