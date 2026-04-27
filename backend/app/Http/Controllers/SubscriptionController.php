<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class SubscriptionController extends Controller
{
    private function removed()
    {
        return response()->json([
            'message' => 'Subscription features have been removed.',
        ], 410);
    }

    public function plans()
    {
        return $this->removed();
    }

    public function current(Request $request)
    {
        return $this->removed();
    }

    public function subscribe(Request $request)
    {
        return $this->removed();
    }

    public function cancel(Request $request)
    {
        return $this->removed();
    }

    public function history(Request $request)
    {
        return $this->removed();
    }

    public function checkFeature(Request $request, string $feature)
    {
        return $this->removed();
    }
}
