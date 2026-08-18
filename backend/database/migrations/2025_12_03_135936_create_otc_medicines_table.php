<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('otc_medicines', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('generic_name')->nullable();
            $table->string('brand')->nullable();
            $table->string('category')->nullable();
            $table->string('dosage')->nullable();
            $table->text('dosage_text')->nullable();
            $table->integer('interval_hours')->default(4);
            $table->integer('max_daily_doses')->default(4);
            $table->text('common_use')->nullable();
            $table->text('description')->nullable();
            $table->text('warnings')->nullable();
            $table->string('age_group')->default('All')->nullable();
            $table->boolean('is_popular')->default(false);
            $table->boolean('is_otc')->default(true);
            $table->boolean('requires_prescription')->default(false);
            $table->timestamps();

            // Indexes for search performance
            $table->index('name');
            $table->index('brand');
            $table->index('generic_name');
            $table->index('category');
            $table->index('age_group');
            $table->index('is_popular');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('otc_medicines');
    }
};