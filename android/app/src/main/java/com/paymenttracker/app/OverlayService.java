package com.paymenttracker.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

public class OverlayService extends Service {
    private static final String TAG = "OverlayService";
    private static final String CHANNEL_ID = "overlay_service_channel";
    private static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_SHOW_OVERLAY = "com.paymenttracker.app.SHOW_OVERLAY";
    public static final String EXTRA_AMOUNT = "amount";
    public static final String EXTRA_MERCHANT = "merchant";
    public static final String EXTRA_TYPE = "type";
    public static final String EXTRA_SOURCE = "source";
    public static final String EXTRA_TRANSACTION_ID = "transactionId";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();

        if (ACTION_SHOW_OVERLAY.equals(action)) {
            // Start as foreground service
            startForeground(NOTIFICATION_ID, createNotification());

            // Extract transaction data
            double amount = intent.getDoubleExtra(EXTRA_AMOUNT, 0);
            String merchant = intent.getStringExtra(EXTRA_MERCHANT);
            String type = intent.getStringExtra(EXTRA_TYPE);
            String source = intent.getStringExtra(EXTRA_SOURCE);
            String transactionId = intent.getStringExtra(EXTRA_TRANSACTION_ID);

            Log.d(TAG, "Showing overlay for transaction: " + transactionId);

            // Launch the overlay activity
            Intent overlayIntent = new Intent(this, TransactionOverlayActivity.class);
            overlayIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            overlayIntent.addFlags(Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
            overlayIntent.putExtra(EXTRA_AMOUNT, amount);
            overlayIntent.putExtra(EXTRA_MERCHANT, merchant);
            overlayIntent.putExtra(EXTRA_TYPE, type);
            overlayIntent.putExtra(EXTRA_SOURCE, source);
            overlayIntent.putExtra(EXTRA_TRANSACTION_ID, transactionId);
            startActivity(overlayIntent);

            // Stop service after launching activity
            stopSelf();
        }

        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Transaction Overlay Service",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Shows transaction overlay when SMS is received");

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification createNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent,
            PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Payment Tracker")
            .setContentText("Processing transaction...")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }
}
