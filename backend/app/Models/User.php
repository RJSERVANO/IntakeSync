<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'email_verified_at',
        'password',
        'api_token',
        'google_id',
        'avatar_url',
        'auth_provider',
        'role',
        'status',
        'phone',
        'date_of_birth',
        'gender',
        'address',
        'emergency_contact',
        'emergency_contact_name',
        'emergency_contact_phone',
        'onboarding_completed',
        'nickname',
        'first_medication_time',
        'end_of_day_time',
        'wake_up_time',
        'breakfast_time',
        'lunch_time',
        'dinner_time',
        'climate',
        'exercise_frequency',
        'weight',
        'weight_unit',
        'age',
        'reminder_tone',
        'notification_permissions_accepted',
        'battery_optimization_set',
        'hydration_goal',
        'last_login_at',
        'last_login_ip',
        'last_sync_at',
        'last_app_version',
        'medical_history',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'api_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'date_of_birth' => 'date',
            'last_login_at' => 'datetime',
            'last_sync_at' => 'datetime',
            'password' => 'hashed',
            'onboarding_completed' => 'boolean',
            'weight' => 'decimal:2',
            'notification_permissions_accepted' => 'boolean',
            'battery_optimization_set' => 'boolean',
        ];
    }

    public function activityLogs()
    {
        return $this->hasMany(UserActivityLog::class);
    }

    public function hydrationEntries()
    {
        return $this->hasMany(HydrationEntry::class);
    }

    public function medicationHistory()
    {
        return $this->hasMany(MedicationHistory::class);
    }

    public function notifications()
    {
        return $this->hasMany(Notification::class);
    }

}
