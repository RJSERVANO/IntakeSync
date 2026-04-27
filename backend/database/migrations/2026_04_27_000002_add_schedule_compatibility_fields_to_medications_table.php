<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('medications', function (Blueprint $table) {
            if (!Schema::hasColumn('medications', 'start_date')) {
                $table->date('start_date')->nullable()->after('reminder');
            }

            if (!Schema::hasColumn('medications', 'end_date')) {
                $table->date('end_date')->nullable()->after('start_date');
            }

            if (!Schema::hasColumn('medications', 'frequency')) {
                $table->string('frequency')->default('daily')->after('end_date');
            }

            if (!Schema::hasColumn('medications', 'days_of_week')) {
                $table->json('days_of_week')->nullable()->after('frequency');
            }

            if (!Schema::hasColumn('medications', 'notes')) {
                $table->text('notes')->nullable()->after('days_of_week');
            }

            if (!Schema::hasColumn('medications', 'color')) {
                $table->string('color', 7)->nullable()->after('notes');
            }
        });
    }

    public function down(): void
    {
        Schema::table('medications', function (Blueprint $table) {
            if (Schema::hasColumn('medications', 'color')) {
                $table->dropColumn('color');
            }

            if (Schema::hasColumn('medications', 'notes')) {
                $table->dropColumn('notes');
            }

            if (Schema::hasColumn('medications', 'days_of_week')) {
                $table->dropColumn('days_of_week');
            }

            if (Schema::hasColumn('medications', 'frequency')) {
                $table->dropColumn('frequency');
            }

            if (Schema::hasColumn('medications', 'end_date')) {
                $table->dropColumn('end_date');
            }

            if (Schema::hasColumn('medications', 'start_date')) {
                $table->dropColumn('start_date');
            }
        });
    }
};
