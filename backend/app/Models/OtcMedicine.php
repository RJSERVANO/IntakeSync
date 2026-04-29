<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

class OtcMedicine extends Model
{
    protected $fillable = [
        'name',
        'generic_name',
        'brand',
        'category',
        'age_group',
        'description',
        'common_use',
        'dosage',
        'dosage_text',
        'interval_hours',
        'max_daily_doses',
        'warnings',
        'is_popular',
        'frequency',
        'recommended_times',
        'timing_instructions',
        'is_otc',
        'requires_prescription',
    ];

    protected $casts = [
        'is_popular' => 'boolean',
        'recommended_times' => 'array',
        'is_otc' => 'boolean',
        'requires_prescription' => 'boolean',
        'interval_hours' => 'integer',
        'max_daily_doses' => 'integer',
    ];

    public function scopeOtcOnly($query)
    {
        if (Schema::hasColumn('otc_medicines', 'is_otc')) {
            $query->where('is_otc', true);
        }

        if (Schema::hasColumn('otc_medicines', 'requires_prescription')) {
            $query->where('requires_prescription', false);
        }

        return $query;
    }

    /**
     * Search medicines by name, brand, or generic name
     */
    public static function search($query, $limit = 20)
    {
        return self::query()
            ->otcOnly()
            ->where(function ($builder) use ($query) {
                $builder->where('name', 'LIKE', "%{$query}%")
                    ->orWhere('brand', 'LIKE', "%{$query}%")
                    ->orWhere('generic_name', 'LIKE', "%{$query}%");
            })
            ->orderBy('is_popular', 'desc')
            ->orderBy('name', 'asc')
            ->limit($limit)
            ->get();
    }
}
