package com.paymenttracker.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Handles notification action buttons (Dismiss, etc.)
 */
public class NotificationActionReceiver extends BroadcastReceiver {
    private static final String TAG = "NotificationAction";
    public static final String ACTION_DISMISS = "com.watchmyexpense.ACTION_DISMISS";
    private static final String PREFS_NAME = "PaymentTrackerSms";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        Log.d(TAG, "Received action: " + action);

        if (ACTION_DISMISS.equals(action)) {
            String transactionId = intent.getStringExtra("transactionId");
            int notificationId = intent.getIntExtra("notificationId", -1);

            Log.d(TAG, "Dismissing transaction: " + transactionId);

            // Mark transaction as dismissed (not deleted, just acknowledged)
            markTransactionAsDismissed(context, transactionId);

            // Cancel the notification
            if (notificationId != -1) {
                NotificationManager manager = (NotificationManager)
                    context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (manager != null) {
                    manager.cancel(notificationId);
                }
            }

            // Update monitoring notification
            Intent updateIntent = new Intent("com.watchmyexpense.UPDATE_MONITOR_NOTIFICATION");
            context.sendBroadcast(updateIntent);
        }
    }

    private void markTransactionAsDismissed(Context context, String transactionId) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existingJson = prefs.getString("pendingTransactions", "[]");
            JSONArray pendingArray = new JSONArray(existingJson);
            JSONArray updatedArray = new JSONArray();

            for (int i = 0; i < pendingArray.length(); i++) {
                JSONObject txObj = pendingArray.getJSONObject(i);
                if (txObj.optString("transactionId").equals(transactionId)) {
                    // Mark as dismissed instead of removing
                    txObj.put("dismissed", true);
                    txObj.put("dismissedAt", System.currentTimeMillis());
                }
                updatedArray.put(txObj);
            }

            prefs.edit().putString("pendingTransactions", updatedArray.toString()).apply();
            Log.d(TAG, "Transaction marked as dismissed: " + transactionId);
        } catch (Exception e) {
            Log.e(TAG, "Failed to mark transaction as dismissed", e);
        }
    }
}
