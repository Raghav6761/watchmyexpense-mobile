package com.paymenttracker.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Receiver that starts the SMS monitoring service when the device boots.
 * Only starts if monitoring was previously enabled by the user.
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        Log.d(TAG, "Boot receiver triggered with action: " + action);

        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            Intent.ACTION_MY_PACKAGE_REPLACED.equals(action) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(action)) {

            // Only start if user had monitoring enabled
            if (SmsMonitorService.shouldBeMonitoring(context)) {
                Log.d(TAG, "Starting SMS monitoring service after boot");
                SmsMonitorService.startMonitoring(context);
            } else {
                Log.d(TAG, "Monitoring was not enabled, skipping auto-start");
            }
        }
    }
}
