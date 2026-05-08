<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MedicationHistory extends Model
{
    use HasFactory;

    protected $table = 'medication_history';

    protected $fillable = [
        'medication_id',
        'user_id',
        'client_uuid',
        'status',
        'scheduled_time',
        'taken_time',
        'time',
        'client_uuid',
        'medication_name_snapshot',
        'dosage_snapshot',
    ];

    protected $casts = [
        'time' => 'datetime',
        'scheduled_time' => 'datetime',
        'taken_time' => 'datetime',
    ];

    public function medication()
    {
        return $this->belongsTo(Medication::class)->withTrashed();
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
