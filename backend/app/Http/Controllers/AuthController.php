<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Carbon\Carbon;

class AuthController extends Controller
{
    protected function strongPasswordRule(): PasswordRule
    {
        return PasswordRule::min(8)->mixedCase()->numbers()->symbols();
    }

    protected function dateOfBirthRule(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) {
            if ($value === null || $value === '') {
                return;
            }

            try {
                $date = Carbon::createFromFormat('Y-m-d', (string) $value);
            } catch (\Throwable) {
                $fail('The date of birth must be a valid date.');
                return;
            }

            if (!$date || $date->format('Y-m-d') !== $value) {
                $fail('The date of birth must be a valid date.');
                return;
            }

            if ($date->isFuture()) {
                $fail('The date of birth may not be in the future.');
                return;
            }

            $age = $date->age;
            if ($age < 13) {
                $fail('You must be at least 13 years old.');
                return;
            }

            if ($age > 120) {
                $fail('The date of birth must be within the last 120 years.');
            }
        };
    }

    protected function issueToken(User $user)
    {
        $token = Str::random(60);
        $user->forceFill(['api_token' => hash('sha256', $token)])->save();

        return response()->json([
            'token' => $token,
            'user' => $user->fresh(),
            'onboarding_completed' => (bool) $user->onboarding_completed,
        ]);
    }

    public function register(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'password' => ['required', 'string', 'confirmed', $this->strongPasswordRule()],
            'phone' => ['nullable', 'string', 'regex:/^\+639\d{9}$/'],
            'date_of_birth' => ['nullable', 'date_format:Y-m-d', $this->dateOfBirthRule()],
            'gender' => 'nullable|in:male,female,prefer_not_to_say',
            'address' => 'nullable|string|max:500',
        ]);

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'], // hashed via cast in model
            'phone' => $data['phone'] ?? null,
            'date_of_birth' => $data['date_of_birth'] ?? null,
            'gender' => $data['gender'] ?? null,
            'address' => $data['address'] ?? null,
        ]);

        return $this->issueToken($user)->setStatusCode(201);
    }

    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $data['email'])->first();

        if (!$user || !Hash::check($data['password'], $user->password)) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        return $this->issueToken($user);
    }

    public function google(Request $request)
    {
        $data = $request->validate([
            'id_token' => 'required|string',
        ]);

        $clientIds = config('services.google.client_ids', []);
        if (empty($clientIds) && config('services.google.client_id')) {
            $clientIds = [config('services.google.client_id')];
        }

        if (empty($clientIds)) {
            return response()->json(['message' => 'Google sign-in is not configured.'], 500);
        }

        $googleUser = $this->verifyGoogleIdToken($data['id_token'], $clientIds);
        if (!$googleUser) {
            return response()->json([
                'message' => 'Google sign-in could not be verified. Please try again.',
            ], 401);
        }

        $hasGoogleId = Schema::hasColumn('users', 'google_id');
        $hasAvatarUrl = Schema::hasColumn('users', 'avatar_url');
        $hasAuthProvider = Schema::hasColumn('users', 'auth_provider');

        $user = $hasGoogleId
            ? User::where('google_id', $googleUser['sub'])->first()
            : null;

        if (!$user && !empty($googleUser['email'])) {
            $user = User::where('email', $googleUser['email'])->first();
        }

        if ($user) {
            $updates = [];

            if ($hasGoogleId) {
                $updates['google_id'] = $user->google_id ?: $googleUser['sub'];
            }

            if ($hasAuthProvider) {
                $updates['auth_provider'] = 'google';
            }

            if ($hasAvatarUrl) {
                $updates['avatar_url'] = $googleUser['picture'] ?? $user->avatar_url;
            }

            if (!$user->name && !empty($googleUser['name'])) {
                $updates['name'] = $googleUser['name'];
            }

            if (!empty($updates)) {
                $user->forceFill($updates)->save();
            }
        } else {
            $userData = [
                'name' => $googleUser['name'] ?? explode('@', $googleUser['email'])[0],
                'email' => $googleUser['email'],
                'password' => Str::random(48),
                'email_verified_at' => now(),
            ];

            if ($hasGoogleId) {
                $userData['google_id'] = $googleUser['sub'];
            }

            if ($hasAuthProvider) {
                $userData['auth_provider'] = 'google';
            }

            if ($hasAvatarUrl) {
                $userData['avatar_url'] = $googleUser['picture'] ?? null;
            }

            $user = User::create($userData);
        }

        return $this->issueToken($user);
    }

    protected function verifyGoogleIdToken(string $idToken, array $clientIds): ?array
    {
        try {
            $response = Http::timeout(5)->get('https://oauth2.googleapis.com/tokeninfo', [
                'id_token' => $idToken,
            ]);
        } catch (\Throwable) {
            return null;
        }

        if (!$response->ok()) {
            return null;
        }

        $payload = $response->json();
        $issuer = $payload['iss'] ?? null;
        $emailVerified = $payload['email_verified'] ?? false;

        if (!in_array(($payload['aud'] ?? null), $clientIds, true)) {
            return null;
        }

        if (!in_array($issuer, ['accounts.google.com', 'https://accounts.google.com'], true)) {
            return null;
        }

        if (empty($payload['sub']) || empty($payload['email'])) {
            return null;
        }

        if (!($emailVerified === true || $emailVerified === 'true' || $emailVerified === '1')) {
            return null;
        }

        return [
            'sub' => $payload['sub'],
            'email' => $payload['email'],
            'name' => $payload['name'] ?? null,
            'picture' => $payload['picture'] ?? null,
        ];
    }

    public function logout(Request $request)
    {
        $user = $request->user();
        if ($user) {
            $user->forceFill(['api_token' => null])->save();
        }
        return response()->json(['message' => 'Logged out']);
    }

    public function me(Request $request)
    {
        return response()->json($request->user());
    }

    public function update(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => 'sometimes|required|email|unique:users,email,' . $user->id,
            'phone' => ['sometimes', 'nullable', 'string', 'regex:/^\+639\d{9}$/'],
            'date_of_birth' => ['sometimes', 'nullable', 'date_format:Y-m-d', $this->dateOfBirthRule()],
            'gender' => 'sometimes|nullable|in:male,female,prefer_not_to_say',
            'address' => 'sometimes|nullable|string|max:500',
            'emergency_contact' => 'sometimes|nullable|string|max:255',
            'emergency_contact_name' => 'sometimes|nullable|string|max:255',
            'emergency_contact_phone' => 'sometimes|nullable|string|max:30',
            'nickname' => 'sometimes|nullable|string|max:255',
            'first_medication_time' => 'sometimes|nullable|string|max:20',
            'end_of_day_time' => 'sometimes|nullable|string|max:20',
            'wake_up_time' => 'sometimes|nullable|string|max:20',
            'breakfast_time' => 'sometimes|nullable|string|max:20',
            'lunch_time' => 'sometimes|nullable|string|max:20',
            'dinner_time' => 'sometimes|nullable|string|max:20',
            'climate' => 'sometimes|nullable|in:hot,temperate,cold',
            'exercise_frequency' => 'sometimes|nullable|in:rarely,sometimes,regularly,often',
            'weight' => 'sometimes|nullable|numeric|min:0|max:1000',
            'weight_unit' => 'sometimes|nullable|in:kg,lbs',
            'age' => 'sometimes|nullable|integer|min:0|max:150',
            'reminder_tone' => 'sometimes|nullable|string|max:100',
            'notification_permissions_accepted' => 'sometimes|nullable|boolean',
            'battery_optimization_set' => 'sometimes|nullable|boolean',
        ]);

        $user->fill($data);
        $user->save();

        return response()->json(['user' => $user]);
    }

    public function forgotPassword(Request $request)
    {
        $request->validate(['email' => 'required|email']);

        // Check if user exists
        $user = User::where('email', $request->email)->first();
        if (!$user) {
            return response()->json([
                'message' => 'If an account exists with this email, you will receive a reset code.'
            ]);
        }

        // Generate a 6-digit OTP code
        $code = rand(100000, 999999);

        // Save the code to database (hashed for security)
        DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $request->email],
            [
                'token' => Hash::make($code),
                'created_at' => now()
            ]
        );

        // In production, you would send this via email
        // Mail::to($user->email)->send(new ResetPasswordMail($code));

        return response()->json([
            'message' => 'Verification code sent to your email.',
            'status' => 'success',
            // ⚠️ DEV MODE: Remove this line in production!
            'debug_otp' => $code
        ]);
    }

    public function resetPassword(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'code' => 'required|string',
            'password' => ['required', 'string', 'confirmed', $this->strongPasswordRule()],
        ]);

        // Find the reset token entry
        $resetEntry = DB::table('password_reset_tokens')
            ->where('email', $request->email)
            ->first();

        if (!$resetEntry) {
            return response()->json([
                'message' => 'Invalid or expired reset code.'
            ], 400);
        }

        // Verify the code
        if (!Hash::check($request->code, $resetEntry->token)) {
            return response()->json([
                'message' => 'Invalid reset code.'
            ], 400);
        }

        // Check if the token is expired (15 minutes)
        if (now()->diffInMinutes($resetEntry->created_at) > 15) {
            return response()->json([
                'message' => 'Reset code has expired. Please request a new one.'
            ], 400);
        }

        // Update user password
        $user = User::where('email', $request->email)->first();
        if (!$user) {
            return response()->json([
                'message' => 'User not found.'
            ], 404);
        }

        $user->forceFill([
            'password' => $request->password,
        ])->save();

        // Delete the reset token
        DB::table('password_reset_tokens')
            ->where('email', $request->email)
            ->delete();

        event(new PasswordReset($user));

        return response()->json([
            'message' => 'Password has been reset successfully.'
        ]);
    }

    public function changePassword(Request $request)
    {
        $request->validate([
            'current_password' => 'required|string',
            'new_password' => ['required', 'string', $this->strongPasswordRule()],
        ]);

        $user = $request->user();
        if (!$user || !Hash::check($request->current_password, $user->password)) {
            return response()->json(['message' => 'Current password is incorrect.'], 422);
        }

        $user->forceFill([
            'password' => $request->new_password,
        ])->save();

        return response()->json(['message' => 'Password updated successfully.']);
    }
}
