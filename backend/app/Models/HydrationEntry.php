<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class HydrationEntry extends Model
{
    use HasFactory;
    protected $table = 'hydration_entries';
    protected $fillable = [
        'user_id',
        'client_uuid',
        'amount_ml',
        'source',
        'beverage_type',
        'sugar_level',
        'caffeine_level',
        'notes',
        'drink_label',
        'created_at',
    ];

    protected $casts = [
        'amount_ml' => 'integer',
        'created_at' => 'datetime',
    ];

    public $timestamps = false;

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
