package com.paymenttracker.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import android.util.TypedValue;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.DecimalFormat;

public class TransactionOverlayActivity extends AppCompatActivity {
    private static final String TAG = "TransactionOverlay";

    private String transactionId;
    private String transactionType;
    private String selectedCategory = null;
    private double originalAmount;

    // UI Elements
    private EditText amountInput;
    private EditText descriptionInput;
    private EditText sourceInput;

    // Default category options (used if none stored)
    private static final String[] DEFAULT_EXPENSE_CATEGORIES = {
        "Food", "Transport", "Shopping", "Bills", "Health", "Other"
    };

    private static final String[] DEFAULT_INCOME_CATEGORIES = {
        "Salary", "Refund", "Transfer", "Investment", "Gift", "Other"
    };

    // Dynamic categories loaded from storage
    private String[] expenseCategories;
    private String[] incomeCategories;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Make activity appear over lock screen
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );

        // Allow keyboard to show properly
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        setContentView(R.layout.activity_transaction_overlay);

        // Get transaction data from intent
        Intent intent = getIntent();
        originalAmount = intent.getDoubleExtra(OverlayService.EXTRA_AMOUNT, 0);
        String merchant = intent.getStringExtra(OverlayService.EXTRA_MERCHANT);
        transactionType = intent.getStringExtra(OverlayService.EXTRA_TYPE);
        String source = intent.getStringExtra(OverlayService.EXTRA_SOURCE);
        transactionId = intent.getStringExtra(OverlayService.EXTRA_TRANSACTION_ID);

        Log.d(TAG, "Showing overlay for: " + merchant + " - " + originalAmount);

        // Load categories from SharedPreferences
        loadCategories();

        // Initialize UI elements
        amountInput = findViewById(R.id.amount_input);
        descriptionInput = findViewById(R.id.description_input);
        sourceInput = findViewById(R.id.source_input);

        // Set up UI
        setupUI(originalAmount, merchant, source);
        setupCategoryButtons();
        setupActionButtons();

        // Close when clicking outside the bottom sheet
        findViewById(R.id.overlay_root).setOnClickListener(v -> finish());
    }

    private void loadCategories() {
        try {
            SharedPreferences prefs = getSharedPreferences("PaymentTrackerOverlay", Context.MODE_PRIVATE);

            // Load expense categories
            String expenseJson = prefs.getString("expenseCategories", null);
            if (expenseJson != null && !expenseJson.isEmpty()) {
                JSONArray expenseArray = new JSONArray(expenseJson);
                expenseCategories = new String[expenseArray.length()];
                for (int i = 0; i < expenseArray.length(); i++) {
                    expenseCategories[i] = expenseArray.getString(i);
                }
                Log.d(TAG, "Loaded " + expenseCategories.length + " expense categories from storage");
            } else {
                expenseCategories = DEFAULT_EXPENSE_CATEGORIES;
                Log.d(TAG, "Using default expense categories");
            }

            // Load income categories
            String incomeJson = prefs.getString("incomeCategories", null);
            if (incomeJson != null && !incomeJson.isEmpty()) {
                JSONArray incomeArray = new JSONArray(incomeJson);
                incomeCategories = new String[incomeArray.length()];
                for (int i = 0; i < incomeArray.length(); i++) {
                    incomeCategories[i] = incomeArray.getString(i);
                }
                Log.d(TAG, "Loaded " + incomeCategories.length + " income categories from storage");
            } else {
                incomeCategories = DEFAULT_INCOME_CATEGORIES;
                Log.d(TAG, "Using default income categories");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error loading categories", e);
            expenseCategories = DEFAULT_EXPENSE_CATEGORIES;
            incomeCategories = DEFAULT_INCOME_CATEGORIES;
        }
    }

    private void setupUI(double amount, String merchant, String source) {
        // Type badge
        TextView typeBadge = findViewById(R.id.type_badge);
        boolean isExpense = "expense".equals(transactionType);
        typeBadge.setText(isExpense ? "EXPENSE" : "INCOME");
        typeBadge.setBackgroundResource(isExpense ? R.drawable.badge_background : R.drawable.badge_income);

        // Amount - editable
        DecimalFormat df = new DecimalFormat("#.##");
        amountInput.setText(df.format(amount));
        amountInput.setTextColor(ContextCompat.getColor(this,
            isExpense ? android.R.color.holo_red_dark : android.R.color.holo_green_dark));

        // Description - editable
        descriptionInput.setText(merchant != null ? merchant : "");

        // Source - editable
        sourceInput.setText(source != null ? source : "");
    }

    private void setupCategoryButtons() {
        LinearLayout container = findViewById(R.id.category_container);
        container.removeAllViews();

        String[] categories = "expense".equals(transactionType) ? expenseCategories : incomeCategories;

        // Convert dp to pixels for margins
        final float scale = getResources().getDisplayMetrics().density;
        final int marginPx = (int) (6 * scale + 0.5f);

        for (String category : categories) {
            TextView chip = createCategoryChip(category);

            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            );
            params.setMargins(0, 0, marginPx, 0);
            chip.setLayoutParams(params);

            container.addView(chip);
        }

        Log.d(TAG, "Set up " + categories.length + " category chips");
    }

    private TextView createCategoryChip(String category) {
        TextView chip = new TextView(this);
        chip.setText(category);
        chip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);

        // Chip-style padding (more horizontal than vertical)
        int hPadding = (int) (16 * getResources().getDisplayMetrics().density);
        int vPadding = (int) (10 * getResources().getDisplayMetrics().density);
        chip.setPadding(hPadding, vPadding, hPadding, vPadding);

        chip.setGravity(android.view.Gravity.CENTER);
        chip.setBackgroundResource(R.drawable.category_chip);
        chip.setTextColor(0xFF374151);
        chip.setClickable(true);
        chip.setFocusable(true);

        // Single line - no wrapping
        chip.setSingleLine(true);
        chip.setMaxLines(1);

        chip.setOnClickListener(v -> {
            // Deselect all chips
            LinearLayout container = findViewById(R.id.category_container);
            for (int i = 0; i < container.getChildCount(); i++) {
                View child = container.getChildAt(i);
                if (child instanceof TextView) {
                    child.setSelected(false);
                    child.setBackgroundResource(R.drawable.category_chip);
                    ((TextView) child).setTextColor(0xFF374151);
                }
            }

            // Select this chip
            chip.setSelected(true);
            chip.setBackgroundResource(R.drawable.category_chip_selected);
            chip.setTextColor(0xFFFFFFFF);
            selectedCategory = category;

            Log.d(TAG, "Selected category: " + category);
        });

        return chip;
    }

    private void setupActionButtons() {
        Button btnLater = findViewById(R.id.btn_later);
        Button btnSave = findViewById(R.id.btn_save);

        btnLater.setOnClickListener(v -> {
            // Save current edits without category
            saveTransaction(false);
            finish();
        });

        btnSave.setOnClickListener(v -> {
            if (selectedCategory == null) {
                Toast.makeText(this, "Please select a category", Toast.LENGTH_SHORT).show();
                return;
            }

            // Save with category
            saveTransaction(true);
            Toast.makeText(this, "Saved as " + selectedCategory, Toast.LENGTH_SHORT).show();
            finish();
        });
    }

    private void saveTransaction(boolean withCategory) {
        // Get edited values
        String amountStr = amountInput.getText().toString().trim();
        String description = descriptionInput.getText().toString().trim();
        String source = sourceInput.getText().toString().trim();

        double amount = originalAmount;
        try {
            if (!amountStr.isEmpty()) {
                amount = Double.parseDouble(amountStr);
            }
        } catch (NumberFormatException e) {
            Log.e(TAG, "Invalid amount: " + amountStr);
        }

        // Save to SharedPreferences for persistence (works even when app is in background)
        saveToSharedPreferences(transactionId, amount, description, source, withCategory, selectedCategory);

        // Also send broadcast in case app is active
        Intent intent = new Intent("com.paymenttracker.app.TRANSACTION_UPDATED");
        intent.setPackage(getPackageName());
        intent.putExtra("transactionId", transactionId);
        intent.putExtra("amount", amount);
        intent.putExtra("description", description);
        intent.putExtra("source", source);
        intent.putExtra("withCategory", withCategory);

        if (withCategory && selectedCategory != null) {
            intent.putExtra("category", selectedCategory);
        }

        sendBroadcast(intent);

        // Dismiss notification if saved with category
        if (withCategory) {
            dismissNotification();
        }

        Log.d(TAG, "Saved transaction: " + transactionId +
            " amount=" + amount +
            " description=" + description +
            " source=" + source +
            " category=" + (withCategory ? selectedCategory : "none"));
    }

    private void saveToSharedPreferences(String txId, double amount, String description,
                                         String source, boolean withCategory, String category) {
        try {
            SharedPreferences prefs = getSharedPreferences("PaymentTrackerOverlay", Context.MODE_PRIVATE);

            // Get existing pending updates
            String existingJson = prefs.getString("pendingUpdates", "[]");
            JSONArray updates = new JSONArray(existingJson);

            // Create new update
            JSONObject update = new JSONObject();
            update.put("transactionId", txId);
            update.put("amount", amount);
            update.put("description", description);
            update.put("source", source);
            update.put("withCategory", withCategory);
            if (withCategory && category != null) {
                update.put("category", category);
            }
            update.put("timestamp", System.currentTimeMillis());

            // Add to array
            updates.put(update);

            // Save back
            prefs.edit().putString("pendingUpdates", updates.toString()).apply();

            Log.d(TAG, "Saved update to SharedPreferences: " + update.toString());
        } catch (Exception e) {
            Log.e(TAG, "Failed to save to SharedPreferences", e);
        }
    }

    private void dismissNotification() {
        try {
            NotificationManager notificationManager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

            // Use transaction ID hash as notification ID (same as in notification service)
            // Use Math.abs to match the TypeScript hashCode implementation
            int notificationId = Math.abs(transactionId.hashCode());
            notificationManager.cancel(notificationId);

            Log.d(TAG, "Dismissed notification for transaction: " + transactionId + " (id: " + notificationId + ")");
        } catch (Exception e) {
            Log.e(TAG, "Failed to dismiss notification", e);
        }
    }

    @Override
    public void onBackPressed() {
        super.onBackPressed();
        finish();
    }
}
