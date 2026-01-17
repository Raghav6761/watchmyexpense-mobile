package com.paymenttracker.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

/**
 * Foreground service that keeps the app alive for reliable SMS monitoring.
 * Shows a persistent notification indicating the app is actively monitoring for transactions.
 */
public class SmsMonitorService extends Service {
    private static final String TAG = "SmsMonitorService";
    private static final String CHANNEL_ID = "sms_monitor_channel";
    private static final String CHANNEL_NAME = "Transaction Monitoring";
    private static final int NOTIFICATION_ID = 1;
    private static final String PREFS_NAME = "SmsMonitorPrefs";
    private static final String KEY_MONITORING_ENABLED = "monitoringEnabled";

    public static final String ACTION_START_MONITORING = "com.watchmyexpense.START_MONITORING";
    public static final String ACTION_STOP_MONITORING = "com.watchmyexpense.STOP_MONITORING";

    private static boolean isRunning = false;

    public static boolean isRunning() {
        return isRunning;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "SmsMonitorService created");
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        Log.d(TAG, "onStartCommand with action: " + action);

        if (ACTION_STOP_MONITORING.equals(action)) {
            stopMonitoring();
            return START_NOT_STICKY;
        }

        // Start foreground with persistent notification
        startForeground(NOTIFICATION_ID, createMonitoringNotification());
        isRunning = true;

        // Save state
        saveMonitoringState(true);

        Log.d(TAG, "SMS monitoring started");

        // Return STICKY so the service restarts if killed
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        isRunning = false;
        Log.d(TAG, "SmsMonitorService destroyed");
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW // Low importance = no sound, but visible
            );
            channel.setDescription("Shows when the app is monitoring for bank transactions");
            channel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification createMonitoringNotification() {
        // Intent to open app
        Intent openIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (openIntent == null) {
            openIntent = new Intent(this, MainActivity.class);
        }
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent openPendingIntent = PendingIntent.getActivity(this, 0, openIntent, flags);

        // Intent to stop monitoring
        Intent stopIntent = new Intent(this, SmsMonitorService.class);
        stopIntent.setAction(ACTION_STOP_MONITORING);
        PendingIntent stopPendingIntent = PendingIntent.getService(this, 1, stopIntent, flags);

        // Get pending transaction count
        int pendingCount = getPendingTransactionCount();
        String contentText = pendingCount > 0
            ? pendingCount + " transaction(s) pending categorization"
            : "Watching for bank SMS";

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Watch My Expense Active")
            .setContentText(contentText)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(openPendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopPendingIntent)
            .build();
    }

    private void stopMonitoring() {
        saveMonitoringState(false);
        isRunning = false;
        stopForeground(true);
        stopSelf();
        Log.d(TAG, "SMS monitoring stopped");
    }

    private void saveMonitoringState(boolean enabled) {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_MONITORING_ENABLED, enabled).apply();
    }

    private int getPendingTransactionCount() {
        try {
            SharedPreferences prefs = getSharedPreferences("PaymentTrackerSms", MODE_PRIVATE);
            String pendingJson = prefs.getString("pendingTransactions", "[]");
            org.json.JSONArray arr = new org.json.JSONArray(pendingJson);
            return arr.length();
        } catch (Exception e) {
            return 0;
        }
    }

    /**
     * Update the monitoring notification (e.g., when new transaction detected)
     */
    public void updateNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null && isRunning) {
            manager.notify(NOTIFICATION_ID, createMonitoringNotification());
        }
    }

    /**
     * Helper to start the monitoring service
     */
    public static void startMonitoring(Context context) {
        Intent intent = new Intent(context, SmsMonitorService.class);
        intent.setAction(ACTION_START_MONITORING);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    /**
     * Helper to stop the monitoring service
     */
    public static void stopMonitoring(Context context) {
        Intent intent = new Intent(context, SmsMonitorService.class);
        intent.setAction(ACTION_STOP_MONITORING);
        context.startService(intent);
    }

    /**
     * Check if monitoring should be enabled (from saved preference)
     */
    public static boolean shouldBeMonitoring(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        return prefs.getBoolean(KEY_MONITORING_ENABLED, false);
    }
}
