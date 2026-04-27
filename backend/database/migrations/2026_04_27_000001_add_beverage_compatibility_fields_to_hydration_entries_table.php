<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('hydration_entries', function (Blueprint $table) {
            if (!Schema::hasColumn('hydration_entries', 'beverage_type')) {
                $table->string('beverage_type')->default('water')->after('source');
            }

            if (!Schema::hasColumn('hydration_entries', 'sugar_level')) {
                $table->string('sugar_level')->default('none')->after('beverage_type');
            }

            if (!Schema::hasColumn('hydration_entries', 'caffeine_level')) {
                $table->string('caffeine_level')->default('none')->after('sugar_level');
            }

            if (!Schema::hasColumn('hydration_entries', 'notes')) {
                $table->text('notes')->nullable()->after('caffeine_level');
            }

            if (!Schema::hasColumn('hydration_entries', 'drink_label')) {
                $table->string('drink_label')->nullable()->after('notes');
            }
        });
    }

    public function down(): void
    {
        Schema::table('hydration_entries', function (Blueprint $table) {
            if (Schema::hasColumn('hydration_entries', 'drink_label')) {
                $table->dropColumn('drink_label');
            }

            if (Schema::hasColumn('hydration_entries', 'notes')) {
                $table->dropColumn('notes');
            }

            if (Schema::hasColumn('hydration_entries', 'caffeine_level')) {
                $table->dropColumn('caffeine_level');
            }

            if (Schema::hasColumn('hydration_entries', 'sugar_level')) {
                $table->dropColumn('sugar_level');
            }

            if (Schema::hasColumn('hydration_entries', 'beverage_type')) {
                $table->dropColumn('beverage_type');
            }
        });
    }
};
