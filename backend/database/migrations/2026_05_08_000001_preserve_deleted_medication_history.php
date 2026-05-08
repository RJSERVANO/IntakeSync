<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('medications', function (Blueprint $table) {
            if (!Schema::hasColumn('medications', 'deleted_at')) {
                $table->softDeletes();
            }
        });

        Schema::table('medication_history', function (Blueprint $table) {
            if (!Schema::hasColumn('medication_history', 'medication_name_snapshot')) {
                $table->string('medication_name_snapshot')->nullable()->after('client_uuid');
            }
            if (!Schema::hasColumn('medication_history', 'dosage_snapshot')) {
                $table->string('dosage_snapshot')->nullable()->after('medication_name_snapshot');
            }
            if (Schema::hasColumn('medication_history', 'user_id')) {
                $table->index(['user_id', 'time'], 'med_history_user_time_index');
            }
        });
    }

    public function down(): void
    {
        Schema::table('medication_history', function (Blueprint $table) {
            if (Schema::hasColumn('medication_history', 'user_id')) {
                $table->dropIndex('med_history_user_time_index');
            }
            if (Schema::hasColumn('medication_history', 'dosage_snapshot')) {
                $table->dropColumn('dosage_snapshot');
            }
            if (Schema::hasColumn('medication_history', 'medication_name_snapshot')) {
                $table->dropColumn('medication_name_snapshot');
            }
        });

        Schema::table('medications', function (Blueprint $table) {
            if (Schema::hasColumn('medications', 'deleted_at')) {
                $table->dropSoftDeletes();
            }
        });
    }
};
