<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $driver = DB::connection()->getDriverName();

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE otc_medicines MODIFY interval_hours INT NULL DEFAULT 4');
            DB::statement('ALTER TABLE otc_medicines MODIFY max_daily_doses INT NULL DEFAULT 4');
        } elseif ($driver === 'pgsql') {
            DB::statement('ALTER TABLE otc_medicines ALTER COLUMN interval_hours DROP NOT NULL');
            DB::statement('ALTER TABLE otc_medicines ALTER COLUMN interval_hours SET DEFAULT 4');
            DB::statement('ALTER TABLE otc_medicines ALTER COLUMN max_daily_doses DROP NOT NULL');
            DB::statement('ALTER TABLE otc_medicines ALTER COLUMN max_daily_doses SET DEFAULT 4');
        } elseif ($driver === 'sqlite') {
            // SQLite keeps this as-is; current SQLite schema allows null/default behavior in seeds.
        }

        Schema::table('otc_medicines', function (Blueprint $table) {
            $table->string('frequency')->nullable()->comment('once_daily, twice_daily, three_times_daily, four_times_daily, as_needed');
            $table->json('recommended_times')->nullable()->comment('Array of recommended times like ["08:00", "20:00"]');
            $table->text('timing_instructions')->nullable()->comment('e.g., "Take with food", "Before bedtime"');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('otc_medicines', function (Blueprint $table) {
            $table->dropColumn(['frequency', 'recommended_times', 'timing_instructions']);
        });

        $driver = DB::connection()->getDriverName();

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE otc_medicines MODIFY interval_hours INT NOT NULL DEFAULT 4');
            DB::statement('ALTER TABLE otc_medicines MODIFY max_daily_doses INT NOT NULL DEFAULT 4');
        } elseif ($driver === 'pgsql') {
            DB::statement('UPDATE otc_medicines SET interval_hours = 4 WHERE interval_hours IS NULL');
            DB::statement('UPDATE otc_medicines SET max_daily_doses = 4 WHERE max_daily_doses IS NULL');
            DB::statement('ALTER TABLE otc_medicines ALTER COLUMN interval_hours SET DEFAULT 4');
            DB::statement('ALTER TABLE otc_medicines ALTER COLUMN interval_hours SET NOT NULL');
            DB::statement('ALTER TABLE otc_medicines ALTER COLUMN max_daily_doses SET DEFAULT 4');
            DB::statement('ALTER TABLE otc_medicines ALTER COLUMN max_daily_doses SET NOT NULL');
        }
    }
};
