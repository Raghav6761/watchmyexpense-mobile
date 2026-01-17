package com.paymenttracker.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.telephony.SmsMessage;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedList;
import java.util.Queue;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class SmsReceiver extends BroadcastReceiver {
    private static final String TAG = "SmsReceiver";
    private static final String PREFS_NAME = "PaymentTrackerSms";
    private static final String PENDING_SMS_KEY = "pendingSms";
    private static final long RATE_LIMIT_MS = 1500; // 1.5 seconds between SMS processing
    private static final int MAX_QUEUE_SIZE = 20; // Maximum queued SMS
    private static final String NOTIFICATION_CHANNEL_ID = "payment_tracker_sms";
    private static final String NOTIFICATION_CHANNEL_NAME = "Transaction Alerts";
    private static int notificationId = 1000;

    private static SmsListener smsListener;
    private static final Handler handler = new Handler(Looper.getMainLooper());
    private static final Queue<SmsQueueItem> smsQueue = new LinkedList<>();
    private static boolean isProcessing = false;
    private static long lastProcessedTime = 0;

    private static class SmsQueueItem {
        final Context context;
        final String sender;
        final String body;

        SmsQueueItem(Context context, String sender, String body) {
            this.context = context.getApplicationContext(); // Use app context to avoid leaks
            this.sender = sender;
            this.body = body;
        }
    }

    // Bank sender IDs to detect
    private static final String[] BANK_SENDERS = {
        "SBI", "SBIBNK", "SBIPSG", "SBIINB", "SBICRD", "SBMSMS", "SBIUPI",
        "HDFCBK", "HDFCCC", "HDFC", "HDFCUPI",
        "AXISBK", "AXISCC", "AXIS", "AXISUPI",
        "ICICIB", "ICICI", "ICICIC", "ICICIUPI",
        "KOTAKB", "KOTAK",
        "PNBSMS", "PNB",
        "BOIIND", "BOI",
        "CANBNK", "CANARA",
        "UNIONB", "UNION",
        "IABORB", "IOB",
        "CREDCLUB", "CRED",
        "GOOGLE", "GPAY", "GPAYTM",
        "PAYTM", "PYTM",
        "PHONEPE", "PHNEPE",
        "UPI", "NPCI", "UPIBNK"
    };

    // Keywords for transaction type detection
    private static final String[] DEBIT_KEYWORDS = {"debited", "debit", "spent", "paid", "payment of", "purchase", "withdrawn", "used for", "charged", "deducted", "transferred"};
    private static final String[] CREDIT_KEYWORDS = {"credited", "received", "deposit", "refund", "cashback", "reversed"};

    public interface SmsListener {
        void onSmsReceived(String sender, String body);
    }

    public static void setSmsListener(SmsListener listener) {
        smsListener = listener;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent.getAction() == null || !intent.getAction().equals("android.provider.Telephony.SMS_RECEIVED")) {
            return;
        }

        Bundle bundle = intent.getExtras();
        if (bundle == null) {
            return;
        }

        Object[] pdus = (Object[]) bundle.get("pdus");
        if (pdus == null) {
            return;
        }

        String format = bundle.getString("format");

        // Concatenate all PDUs into a single message (for multi-part SMS)
        StringBuilder fullMessage = new StringBuilder();
        String sender = null;

        for (Object pdu : pdus) {
            SmsMessage smsMessage;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                smsMessage = SmsMessage.createFromPdu((byte[]) pdu, format);
            } else {
                smsMessage = SmsMessage.createFromPdu((byte[]) pdu);
            }

            if (sender == null) {
                sender = smsMessage.getDisplayOriginatingAddress();
            }
            fullMessage.append(smsMessage.getMessageBody());
        }

        String body = fullMessage.toString();

        Log.d(TAG, "SMS received from: " + sender);
        Log.d(TAG, "SMS body length: " + body.length());

        // Only process if sender is valid
        if (sender == null) {
            return;
        }

        // Check if this is a bank SMS
        if (!isBankSms(sender)) {
            Log.d(TAG, "Not a bank SMS, ignoring");
            return;
        }

        Log.d(TAG, "Bank SMS detected from: " + sender);

        // Queue the SMS for rate-limited processing
        queueSms(context, sender, body);
    }

    /**
     * Queue SMS for rate-limited processing to prevent flooding
     */
    private synchronized void queueSms(Context context, String sender, String body) {
        // Check queue size to prevent memory issues
        if (smsQueue.size() >= MAX_QUEUE_SIZE) {
            Log.w(TAG, "SMS queue full, dropping oldest SMS");
            smsQueue.poll();
        }

        smsQueue.offer(new SmsQueueItem(context, sender, body));
        Log.d(TAG, "SMS queued. Queue size: " + smsQueue.size());

        // Start processing if not already running
        if (!isProcessing) {
            processNextSms();
        }
    }

    /**
     * Process the next SMS in queue with rate limiting
     */
    private static synchronized void processNextSms() {
        if (smsQueue.isEmpty()) {
            isProcessing = false;
            Log.d(TAG, "SMS queue empty, stopping processor");
            return;
        }

        isProcessing = true;

        // Calculate delay based on last processed time
        long now = System.currentTimeMillis();
        long timeSinceLast = now - lastProcessedTime;
        long delay = Math.max(0, RATE_LIMIT_MS - timeSinceLast);

        handler.postDelayed(() -> {
            SmsQueueItem item;
            synchronized (SmsReceiver.class) {
                item = smsQueue.poll();
                lastProcessedTime = System.currentTimeMillis();
            }

            if (item != null) {
                processSmsItem(item);
            }

            // Process next item
            processNextSms();
        }, delay);
    }

    /**
     * Process a single SMS item
     */
    private static void processSmsItem(SmsQueueItem item) {
        try {
            Log.d(TAG, "Processing SMS from: " + item.sender);

            if (smsListener != null) {
                // App is running with listener - forward to Angular
                Log.d(TAG, "Listener available, forwarding SMS to Angular");
                smsListener.onSmsReceived(item.sender, item.body);
            } else {
                // App is killed or plugin not loaded - parse natively and show overlay
                Log.d(TAG, "Listener not available, processing natively");

                // Parse and store transaction directly (showOverlayDirectlyStatic handles storage)
                // Note: Don't call storePendingSmsStatic here - it would cause duplicate transactions
                // since showOverlayDirectlyStatic already stores the parsed transaction
                showOverlayDirectlyStatic(item.context, item.sender, item.body);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error processing SMS from " + item.sender, e);
        }
    }

    /**
     * Check if sender is from a known bank
     */
    private boolean isBankSms(String sender) {
        String normalizedSender = sender.toUpperCase().replaceAll("[^A-Z]", "");
        for (String bank : BANK_SENDERS) {
            if (normalizedSender.contains(bank) || bank.contains(normalizedSender)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Parse SMS and show overlay directly (when app is killed)
     */
    private static void showOverlayDirectlyStatic(Context context, String sender, String body) {
        // Check overlay permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
            Log.d(TAG, "Overlay permission not granted, skipping direct overlay");
            return;
        }

        // Parse transaction details with error handling
        String type;
        Double amount;
        try {
            type = detectTransactionTypeStatic(body);
            if (type == null) {
                Log.d(TAG, "Could not detect transaction type");
                return;
            }

            amount = extractAmountStatic(body);
            if (amount == null) {
                Log.d(TAG, "Could not extract amount");
                return;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error parsing SMS", e);
            return;
        }

        String source = determineSourceStatic(sender);
        String transactionId = UUID.randomUUID().toString();

        Log.d(TAG, "Parsed: type=" + type + ", amount=" + amount + ", source=" + source);

        // Store transaction data for Angular to pick up
        storeTransactionForAngularStatic(context, transactionId, amount, type, source, body);

        // Always show notification when app is killed (most reliable)
        showTransactionNotification(context, transactionId, amount, type, source);

        // Also try to start overlay service (may not work when app is killed)
        try {
            Intent serviceIntent = new Intent(context, OverlayService.class);
            serviceIntent.setAction(OverlayService.ACTION_SHOW_OVERLAY);
            serviceIntent.putExtra(OverlayService.EXTRA_TRANSACTION_ID, transactionId);
            serviceIntent.putExtra(OverlayService.EXTRA_AMOUNT, amount);
            serviceIntent.putExtra(OverlayService.EXTRA_MERCHANT, "Transaction");
            serviceIntent.putExtra(OverlayService.EXTRA_TYPE, type);
            serviceIntent.putExtra(OverlayService.EXTRA_SOURCE, source);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }

            Log.d(TAG, "Started overlay service directly for transaction: " + transactionId);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start overlay service", e);
        }
    }

    /**
     * Detect transaction type (expense/income)
     */
    private static String detectTransactionTypeStatic(String message) {
        String lowerMessage = message.toLowerCase();

        boolean isDebit = false;
        boolean isCredit = false;

        for (String keyword : DEBIT_KEYWORDS) {
            if (lowerMessage.contains(keyword)) {
                isDebit = true;
                break;
            }
        }

        for (String keyword : CREDIT_KEYWORDS) {
            if (lowerMessage.contains(keyword)) {
                isCredit = true;
                break;
            }
        }

        if (isDebit && !isCredit) return "expense";
        if (isCredit && !isDebit) return "income";
        if (isDebit && isCredit) return "expense"; // Default to expense if ambiguous

        return null;
    }

    /**
     * Extract amount from SMS
     */
    private static Double extractAmountStatic(String message) {
        // Patterns - order matters, more specific first
        // Examples: Rs.500.00, Rs 500, Rs.338, INR 270, ₹500, debited by 40
        String[] patterns = {
            // "Spent INR 270" or "Spent Rs.338"
            "Spent\\s+(?:INR|Rs\\.?)\\s*([\\d,]+(?:\\.\\d{1,2})?)",
            // Standard currency patterns
            "Rs\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
            "INR\\s*([\\d,]+(?:\\.\\d{1,2})?)",
            "₹\\s*([\\d,]+(?:\\.\\d{1,2})?)",
            "Rupees?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
            // "amount of Rs.X" or "payment of Rs.X"
            "(?:amount|payment)\\s*(?:of\\s*)?Rs\\.?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
            // "debited by 40" - no currency symbol (SBI UPI style)
            "debited\\s+(?:by\\s+)?([\\d,]+(?:\\.\\d{1,2})?)",
            // "credited by 40" - no currency symbol
            "credited\\s+(?:by\\s+)?([\\d,]+(?:\\.\\d{1,2})?)"
        };

        for (String patternStr : patterns) {
            Pattern pattern = Pattern.compile(patternStr, Pattern.CASE_INSENSITIVE);
            Matcher matcher = pattern.matcher(message);
            if (matcher.find()) {
                String amountStr = matcher.group(1).replace(",", "");
                try {
                    double amount = Double.parseDouble(amountStr);
                    if (amount > 0) {
                        return amount;
                    }
                } catch (NumberFormatException e) {
                    // Continue to next pattern
                }
            }
        }

        return null;
    }

    /**
     * Determine source from sender
     */
    private static String determineSourceStatic(String sender) {
        String upperSender = sender.toUpperCase();
        if (upperSender.contains("HDFC")) return "HDFC";
        if (upperSender.contains("SBI")) return "SBI";
        if (upperSender.contains("AXIS")) return "Axis";
        if (upperSender.contains("ICICI")) return "ICICI";
        if (upperSender.contains("KOTAK")) return "Kotak";
        if (upperSender.contains("CRED")) return "CRED";
        if (upperSender.contains("GPAY") || upperSender.contains("GOOGLE")) return "GPay";
        if (upperSender.contains("PAYTM")) return "Paytm";
        if (upperSender.contains("PHONEPE")) return "PhonePe";
        return "Bank";
    }

    /**
     * Store transaction data for Angular to create proper transaction record
     */
    private static void storeTransactionForAngularStatic(Context context, String transactionId, double amount, String type, String source, String rawMessage) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existingJson = prefs.getString("pendingTransactions", "[]");
            JSONArray pendingArray = new JSONArray(existingJson);

            JSONObject txObj = new JSONObject();
            txObj.put("transactionId", transactionId);
            txObj.put("amount", amount);
            txObj.put("type", type);
            txObj.put("source", source);
            txObj.put("rawMessage", rawMessage);
            txObj.put("timestamp", System.currentTimeMillis());

            pendingArray.put(txObj);

            prefs.edit().putString("pendingTransactions", pendingArray.toString()).apply();
            Log.d(TAG, "Stored pending transaction: " + transactionId);
        } catch (Exception e) {
            Log.e(TAG, "Failed to store pending transaction", e);
        }
    }

    private static void storePendingSmsStatic(Context context, String sender, String body) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existingJson = prefs.getString(PENDING_SMS_KEY, "[]");
            JSONArray pendingArray = new JSONArray(existingJson);

            JSONObject smsObj = new JSONObject();
            smsObj.put("sender", sender);
            smsObj.put("body", body);
            smsObj.put("timestamp", System.currentTimeMillis());

            pendingArray.put(smsObj);

            prefs.edit().putString(PENDING_SMS_KEY, pendingArray.toString()).apply();
            Log.d(TAG, "Stored pending SMS, total pending: " + pendingArray.length());
        } catch (Exception e) {
            Log.e(TAG, "Failed to store pending SMS", e);
        }
    }

    public static String getPendingSms(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(PENDING_SMS_KEY, "[]");
    }

    public static void clearPendingSms(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(PENDING_SMS_KEY, "[]").apply();
        Log.d(TAG, "Cleared pending SMS");
    }

    /**
     * Create notification channel for Android 8+
     */
    private static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                NOTIFICATION_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Alerts for detected bank transactions");
            channel.enableVibration(true);
            channel.setShowBadge(true);

            NotificationManager notificationManager = context.getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }

    /**
     * Show notification for transaction when app is killed
     */
    private static void showTransactionNotification(Context context, String transactionId, double amount, String type, String source) {
        try {
            createNotificationChannel(context);

            int currentNotificationId = notificationId++;
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            // Intent to open app for categorization
            Intent categorizeIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (categorizeIntent == null) {
                categorizeIntent = new Intent();
            }
            categorizeIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            categorizeIntent.putExtra("transactionId", transactionId);
            categorizeIntent.putExtra("action", "categorize");
            PendingIntent categorizePendingIntent = PendingIntent.getActivity(
                context, currentNotificationId * 10, categorizeIntent, flags);

            // Intent to dismiss/acknowledge (mark as seen)
            Intent dismissIntent = new Intent(context, NotificationActionReceiver.class);
            dismissIntent.setAction(NotificationActionReceiver.ACTION_DISMISS);
            dismissIntent.putExtra("transactionId", transactionId);
            dismissIntent.putExtra("notificationId", currentNotificationId);
            PendingIntent dismissPendingIntent = PendingIntent.getBroadcast(
                context, currentNotificationId * 10 + 1, dismissIntent, flags);

            // Format amount
            String formattedAmount = String.format("₹%.2f", amount);
            String title = type.equals("expense") ? "💸 Payment Detected" : "💰 Money Received";
            String text = formattedAmount + " via " + source;
            String bigText = formattedAmount + " via " + source + "\nTap to categorize this transaction";

            // Build notification with actions
            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, NOTIFICATION_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(bigText))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setContentIntent(categorizePendingIntent)
                .addAction(android.R.drawable.ic_menu_edit, "Categorize", categorizePendingIntent)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Dismiss", dismissPendingIntent)
                .setDefaults(NotificationCompat.DEFAULT_ALL);

            NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null) {
                notificationManager.notify(currentNotificationId, builder.build());
                Log.d(TAG, "Notification shown for transaction: " + transactionId);
            }

            // Update monitoring service notification to show pending count
            updateMonitoringNotification(context);
        } catch (Exception e) {
            Log.e(TAG, "Failed to show notification", e);
        }
    }

    /**
     * Update the monitoring service notification with new pending count
     */
    private static void updateMonitoringNotification(Context context) {
        try {
            // Send broadcast to update monitoring notification
            Intent updateIntent = new Intent("com.watchmyexpense.UPDATE_MONITOR_NOTIFICATION");
            context.sendBroadcast(updateIntent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to update monitoring notification", e);
        }
    }
}
