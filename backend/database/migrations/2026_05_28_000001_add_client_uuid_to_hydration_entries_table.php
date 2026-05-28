<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hydration_entries', function (Blueprint $table) {
            if (!Schema::hasColumn('hydration_entries', 'client_uuid')) {
                $table->string('client_uuid')->nullable()->after('id');
                $table->unique(['user_id', 'client_uuid'], 'hydration_entries_user_client_uuid_unique');
            }
        });
    }

    public function down(): void
    {
        Schema::table('hydration_entries', function (Blueprint $table) {
            if (Schema::hasColumn('hydration_entries', 'client_uuid')) {
                $table->dropUnique('hydration_entries_user_client_uuid_unique');
                $table->dropColumn('client_uuid');
            }
        });
    }
};
