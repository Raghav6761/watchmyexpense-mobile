package com.paymenttracker.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "SmsReceiver",
    permissions = {
        @Permission(
            alias = "sms",
            strings = {
                Manifest.permission.RECEIVE_SMS,
                Manifest.permission.READ_SMS
            }
        )
    }
)
public class SmsReceiverPlugin extends Plugin {
    private static final String TAG = "SmsReceiverPlugin";
    private SmsReceiver smsReceiver;
    private boolean isListening = false;
    private BroadcastReceiver transactionUpdateReceiver;

    @Override
    public void load() {
        super.load();
        smsReceiver = new SmsReceiver();

        // Register receiver for transaction updates from overlay
        transactionUpdateReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String transactionId = intent.getStringExtra("transactionId");
                double amount = intent.getDoubleExtra("amount", 0);
                String description = intent.getStringExtra("description");
                String source = intent.getStringExtra("source");
                boolean withCategory = intent.getBooleanExtra("withCategory", false);
                String category = intent.getStringExtra("category");

                JSObject data = new JSObject();
                data.put("transactionId", transactionId);
                data.put("amount", amount);
                data.put("description", description);
                data.put("source", source);
                data.put("withCategory", withCategory);
                if (category != null) {
                    data.put("category", category);
                }

                notifyListeners("transactionUpdated", data);
                Log.d(TAG, "Transaction update received from overlay: " + transactionId);
            }
        };

        IntentFilter filter = new IntentFilter("com.paymenttracker.app.TRANSACTION_UPDATED");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(transactionUpdateReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(transactionUpdateReceiver, filter);
        }

        Log.d(TAG, "SmsReceiverPlugin loaded");
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (getPermissionState("sms") == com.getcapacitor.PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
        } else {
            requestPermissionForAlias("sms", call, "smsPermissionCallback");
        }
    }

    @PermissionCallback
    private void smsPermissionCallback(PluginCall call) {
        if (getPermissionState("sms") == com.getcapacitor.PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
        } else {
            JSObject result = new JSObject();
            result.put("granted", false);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        if (getPermissionState("sms") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("SMS permission not granted");
            return;
        }

        if (isListening) {
            call.resolve();
            return;
        }

        try {
            // Only set the listener - the receiver is already registered in AndroidManifest.xml
            // This avoids duplicate SMS events
            SmsReceiver.setSmsListener((sender, body) -> {
                JSObject data = new JSObject();
                data.put("sender", sender);
                data.put("body", body);
                data.put("timestamp", System.currentTimeMillis());
                notifyListeners("smsReceived", data);
                Log.d(TAG, "SMS event sent to JS: " + sender);
            });

            isListening = true;
            Log.d(TAG, "SMS listener started (using manifest-registered receiver)");
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to start SMS listener", e);
            call.reject("Failed to start SMS listener: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        if (!isListening) {
            call.resolve();
            return;
        }

        try {
            // Only clear the listener - the receiver stays registered in manifest
            // SMS will be stored to pending when listener is null
            SmsReceiver.setSmsListener(null);
            isListening = false;
            Log.d(TAG, "SMS listener stopped (receiver still active in background)");
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop SMS listener", e);
            call.reject("Failed to stop SMS listener: " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("sms") == com.getcapacitor.PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void checkOverlayPermission(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            result.put("granted", Settings.canDrawOverlays(getContext()));
        } else {
            result.put("granted", true);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(getContext())) {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);

                JSObject result = new JSObject();
                result.put("opened", true);
                call.resolve(result);
            } else {
                JSObject result = new JSObject();
                result.put("granted", true);
                call.resolve(result);
            }
        } else {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void showOverlay(PluginCall call) {
        String transactionId = call.getString("transactionId");
        Double amount = call.getDouble("amount", 0.0);
        String merchant = call.getString("merchant", "Unknown");
        String type = call.getString("type", "expense");
        String source = call.getString("source", "");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(getContext())) {
            call.reject("Overlay permission not granted");
            return;
        }

        try {
            Intent serviceIntent = new Intent(getContext(), OverlayService.class);
            serviceIntent.setAction(OverlayService.ACTION_SHOW_OVERLAY);
            serviceIntent.putExtra(OverlayService.EXTRA_TRANSACTION_ID, transactionId);
            serviceIntent.putExtra(OverlayService.EXTRA_AMOUNT, amount);
            serviceIntent.putExtra(OverlayService.EXTRA_MERCHANT, merchant);
            serviceIntent.putExtra(OverlayService.EXTRA_TYPE, type);
            serviceIntent.putExtra(OverlayService.EXTRA_SOURCE, source);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }

            Log.d(TAG, "Started overlay service for transaction: " + transactionId);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to show overlay", e);
            call.reject("Failed to show overlay: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getPendingUpdates(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences("PaymentTrackerOverlay", Context.MODE_PRIVATE);
            String json = prefs.getString("pendingUpdates", "[]");

            JSObject result = new JSObject();
            result.put("updates", new JSArray(json));

            Log.d(TAG, "Retrieved pending updates: " + json);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to get pending updates", e);
            call.reject("Failed to get pending updates: " + e.getMessage());
        }
    }

    @PluginMethod
    public void clearPendingUpdates(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences("PaymentTrackerOverlay", Context.MODE_PRIVATE);
            prefs.edit().putString("pendingUpdates", "[]").apply();

            Log.d(TAG, "Cleared pending updates");
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to clear pending updates", e);
            call.reject("Failed to clear pending updates: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getPendingSms(PluginCall call) {
        try {
            String json = SmsReceiver.getPendingSms(getContext());
            JSObject result = new JSObject();
            result.put("messages", new JSArray(json));
            Log.d(TAG, "Retrieved pending SMS: " + json);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to get pending SMS", e);
            call.reject("Failed to get pending SMS: " + e.getMessage());
        }
    }

    @PluginMethod
    public void clearPendingSms(PluginCall call) {
        try {
            SmsReceiver.clearPendingSms(getContext());
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to clear pending SMS", e);
            call.reject("Failed to clear pending SMS: " + e.getMessage());
        }
    }

    @PluginMethod
    public void setCategories(PluginCall call) {
        try {
            JSArray expenseCategories = call.getArray("expense");
            JSArray incomeCategories = call.getArray("income");

            SharedPreferences prefs = getContext().getSharedPreferences("PaymentTrackerOverlay", Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();

            if (expenseCategories != null) {
                editor.putString("expenseCategories", expenseCategories.toString());
                Log.d(TAG, "Stored expense categories: " + expenseCategories.toString());
            }
            if (incomeCategories != null) {
                editor.putString("incomeCategories", incomeCategories.toString());
                Log.d(TAG, "Stored income categories: " + incomeCategories.toString());
            }

            editor.apply();
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to set categories", e);
            call.reject("Failed to set categories: " + e.getMessage());
        }
    }

    // ========== MONITORING SERVICE METHODS ==========

    @PluginMethod
    public void startMonitoring(PluginCall call) {
        try {
            SmsMonitorService.startMonitoring(getContext());
            Log.d(TAG, "Started SMS monitoring service");
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to start monitoring service", e);
            call.reject("Failed to start monitoring: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopMonitoring(PluginCall call) {
        try {
            SmsMonitorService.stopMonitoring(getContext());
            Log.d(TAG, "Stopped SMS monitoring service");
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop monitoring service", e);
            call.reject("Failed to stop monitoring: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isMonitoring(PluginCall call) {
        JSObject result = new JSObject();
        result.put("monitoring", SmsMonitorService.isRunning());
        call.resolve(result);
    }

    @PluginMethod
    public void getPendingTransactions(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences("PaymentTrackerSms", Context.MODE_PRIVATE);
            String json = prefs.getString("pendingTransactions", "[]");

            JSObject result = new JSObject();
            result.put("transactions", new JSArray(json));
            Log.d(TAG, "Retrieved pending transactions: " + json);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to get pending transactions", e);
            call.reject("Failed to get pending transactions: " + e.getMessage());
        }
    }

    @PluginMethod
    public void clearPendingTransactions(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences("PaymentTrackerSms", Context.MODE_PRIVATE);
            prefs.edit().putString("pendingTransactions", "[]").apply();
            Log.d(TAG, "Cleared pending transactions");
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to clear pending transactions", e);
            call.reject("Failed to clear pending transactions: " + e.getMessage());
        }
    }

    @PluginMethod
    public void removePendingTransaction(PluginCall call) {
        try {
            String transactionId = call.getString("transactionId");
            if (transactionId == null) {
                call.reject("transactionId is required");
                return;
            }

            SharedPreferences prefs = getContext().getSharedPreferences("PaymentTrackerSms", Context.MODE_PRIVATE);
            String existingJson = prefs.getString("pendingTransactions", "[]");
            JSONArray pendingArray = new JSONArray(existingJson);
            JSONArray updatedArray = new JSONArray();

            for (int i = 0; i < pendingArray.length(); i++) {
                JSONObject txObj = pendingArray.getJSONObject(i);
                if (!txObj.optString("transactionId").equals(transactionId)) {
                    updatedArray.put(txObj);
                }
            }

            prefs.edit().putString("pendingTransactions", updatedArray.toString()).apply();
            Log.d(TAG, "Removed pending transaction: " + transactionId);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to remove pending transaction", e);
            call.reject("Failed to remove pending transaction: " + e.getMessage());
        }
    }

    @Override
    protected void handleOnDestroy() {
        // Clear the listener but don't unregister the receiver (it's manifest-registered)
        // This allows SMS to be captured and stored even after plugin is destroyed
        if (isListening) {
            SmsReceiver.setSmsListener(null);
            isListening = false;
        }

        if (transactionUpdateReceiver != null) {
            try {
                getContext().unregisterReceiver(transactionUpdateReceiver);
            } catch (Exception ignored) {}
        }

        super.handleOnDestroy();
    }
}
