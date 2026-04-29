<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('otc_medicines', function (Blueprint $table) {
            if (!Schema::hasColumn('otc_medicines', 'is_otc')) {
                $table->boolean('is_otc')->default(true)->after('timing_instructions');
            }

            if (!Schema::hasColumn('otc_medicines', 'requires_prescription')) {
                $table->boolean('requires_prescription')->default(false)->after('is_otc');
            }

            if (!Schema::hasColumn('otc_medicines', 'common_use')) {
                $table->string('common_use')->nullable()->after('description');
            }

            if (!Schema::hasColumn('otc_medicines', 'dosage_text')) {
                $table->string('dosage_text')->nullable()->after('dosage');
            }

            if (!Schema::hasColumn('otc_medicines', 'interval_hours')) {
                $table->unsignedTinyInteger('interval_hours')->nullable()->after('dosage_text');
            }

            if (!Schema::hasColumn('otc_medicines', 'max_daily_doses')) {
                $table->unsignedTinyInteger('max_daily_doses')->nullable()->after('interval_hours');
            }

            if (!Schema::hasColumn('otc_medicines', 'warnings')) {
                $table->text('warnings')->nullable()->after('max_daily_doses');
            }
        });

        Schema::table('medications', function (Blueprint $table) {
            if (!Schema::hasColumn('medications', 'otc_medicine_id')) {
                $table->unsignedBigInteger('otc_medicine_id')->nullable()->after('color');
            }

            if (!Schema::hasColumn('medications', 'otc_metadata')) {
                $table->json('otc_metadata')->nullable()->after('otc_medicine_id');
            }
        });

        DB::table('otc_medicines')
            ->whereIn('name', ['Mefenamic Acid', 'Dolfenal', 'Ponstan', 'Lomotil', 'Zonrox Bleach', 'Sudafed'])
            ->update([
                'is_otc' => false,
                'requires_prescription' => true,
            ]);
    }

    public function down(): void
    {
        Schema::table('medications', function (Blueprint $table) {
            if (Schema::hasColumn('medications', 'otc_metadata')) {
                $table->dropColumn('otc_metadata');
            }

            if (Schema::hasColumn('medications', 'otc_medicine_id')) {
                $table->dropColumn('otc_medicine_id');
            }
        });

        Schema::table('otc_medicines', function (Blueprint $table) {
            foreach ([
                'warnings',
                'max_daily_doses',
                'interval_hours',
                'dosage_text',
                'common_use',
                'requires_prescription',
                'is_otc',
            ] as $column) {
                if (Schema::hasColumn('otc_medicines', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
