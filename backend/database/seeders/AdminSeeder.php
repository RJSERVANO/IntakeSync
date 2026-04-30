<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $adminEmail = 'admin@aqua.com';
        $intakeSyncAdminEmail = 'admin@intakesync.local';

        // Keep the existing admin email stable so local logins and reset links keep working.
        $admin = User::where('email', $adminEmail)->first();
        $intakeSyncAdmin = User::where('email', $intakeSyncAdminEmail)->first();

        if (!$admin && $intakeSyncAdmin) {
            $intakeSyncAdmin->forceFill([
                'email' => $adminEmail,
                'role' => 'admin',
                'email_verified_at' => $intakeSyncAdmin->email_verified_at ?? now(),
            ])->save();

            $this->command->info("Admin user restored: {$adminEmail} / admin123");
            return;
        }
        
        if (!$admin) {
            User::create([
                'name' => 'Admin User',
                'email' => $adminEmail,
                'password' => Hash::make('admin123'),
                'role' => 'admin',
                'email_verified_at' => now(),
            ]);
            
            $this->command->info("Admin user created: {$adminEmail} / admin123");
        } else {
            $this->command->info('Admin user already exists');
        }
    }
}
