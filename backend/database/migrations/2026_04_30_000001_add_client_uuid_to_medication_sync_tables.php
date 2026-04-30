<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('medications', function (Blueprint $table) {
            if (!Schema::hasColumn('medications', 'client_uuid')) {
                $table->string('client_uuid')->nullable()->after('id');
                $table->unique(['user_id', 'client_uuid'], 'medications_user_client_uuid_unique');
            }
        });

        Schema::table('medication_history', function (Blueprint $table) {
            if (!Schema::hasColumn('medication_history', 'client_uuid')) {
                $table->string('client_uuid')->nullable()->after('id');
                $table->unique(['user_id', 'client_uuid'], 'med_history_user_client_uuid_unique');
            }
        });
    }

    public function down(): void
    {
        Schema::table('medication_history', function (Blueprint $table) {
            if (Schema::hasColumn('medication_history', 'client_uuid')) {
                $table->dropUnique('med_history_user_client_uuid_unique');
                $table->dropColumn('client_uuid');
            }
        });

        Schema::table('medications', function (Blueprint $table) {
            if (Schema::hasColumn('medications', 'client_uuid')) {
                $table->dropUnique('medications_user_client_uuid_unique');
                $table->dropColumn('client_uuid');
            }
        });
    }
};
