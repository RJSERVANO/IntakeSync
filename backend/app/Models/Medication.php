<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Medication extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id',
        'client_uuid',
        'name',
        'dosage',
        'times',
        'reminder',
        'active',
        'start_date',
        'end_date',
        'frequency',
        'days_of_week',
        'notes',
        'color',
        'otc_medicine_id',
        'otc_metadata',
        'client_uuid',
        'deleted_at',
    ];

    protected $casts = [
        'times' => 'array',
        'reminder' => 'boolean',
        'active' => 'boolean',
        'start_date' => 'date',
        'end_date' => 'date',
        'days_of_week' => 'array',
        'otc_metadata' => 'array',
    ];

    public function history()
    {
        return $this->hasMany(MedicationHistory::class);
    }
}
