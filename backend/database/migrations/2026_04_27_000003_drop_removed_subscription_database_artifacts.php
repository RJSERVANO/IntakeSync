<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::disableForeignKeyConstraints();

        Schema::dropIfExists('subscription_transactions');
        Schema::dropIfExists('subscriptions');
        Schema::dropIfExists('subscription_plans');

        if (Schema::hasTable('users')) {
            Schema::table('users', function (Blueprint $table) {
                $columns = [];

                if (Schema::hasColumn('users', 'current_subscription_plan_id')) {
                    $columns[] = 'current_subscription_plan_id';
                }

                if (Schema::hasColumn('users', 'subscription_expires_at')) {
                    $columns[] = 'subscription_expires_at';
                }

                if (!empty($columns)) {
                    $table->dropColumn($columns);
                }
            });
        }

        Schema::enableForeignKeyConstraints();
    }

    public function down(): void
    {
        // Subscription features were removed; rollback should not recreate retired tables.
    }
};