import { Injectable } from '@angular/core';
import { ParsedSms, TransactionType, CATEGORY_KEYWORDS } from '../models/transaction.model';

// Bank sender IDs to monitor
export const BANK_SENDERS = [
  'SBI', 'SBIBNK', 'SBIPSG', 'SBIINB', 'SBICRD', 'SBMSMS', 'SBIUPI',  // SBI
  'HDFCBK', 'HDFCCC', 'HDFC', 'HDFCUPI',                              // HDFC
  'AXISBK', 'AXISCC', 'AXIS', 'AXISUPI',                              // Axis
  'ICICIB', 'ICICI', 'ICICIC', 'ICICIUPI',                            // ICICI
  'KOTAKB', 'KOTAK',                                                   // Kotak
  'PNBSMS', 'PNB',                                                     // PNB
  'BOIIND', 'BOI',                                                     // Bank of India
  'CANBNK', 'CANARA',                                                  // Canara
  'UNIONB', 'UNION',                                                   // Union Bank
  'IABORB', 'IOB',                                                     // IOB
  'CREDCLUB', 'CRED',                                                  // CRED
  'GOOGLE', 'GPAY', 'GPAYTM',                                          // GPay
  'PAYTM', 'PYTM',                                                     // Paytm
  'PHONEPE', 'PHNEPE',                                                 // PhonePe
  'UPI', 'NPCI', 'UPIBNK',                                             // Generic UPI
];

@Injectable({
  providedIn: 'root'
})
export class SmsParserService {

  /**
   * Check if the SMS sender is a bank we monitor
   */
  isBankSms(sender: string): boolean {
    const normalizedSender = sender.toUpperCase().replace(/[^A-Z]/g, '');
    return BANK_SENDERS.some(bank =>
      normalizedSender.includes(bank) || bank.includes(normalizedSender)
    );
  }

  /**
   * Parse an SMS message and extract transaction details
   */
  parseSms(sender: string, message: string): ParsedSms | null {
    try {
      const normalizedSender = sender.toUpperCase();
      const normalizedMessage = message;

      // Detect transaction type
      const type = this.detectTransactionType(normalizedMessage);
      if (!type) return null;

      // Extract amount
      const amount = this.extractAmount(normalizedMessage);
      if (!amount) return null;

      // Extract date
      const date = this.extractDate(normalizedMessage);

      // Extract merchant/payee
      const merchant = this.extractMerchant(normalizedMessage, normalizedSender);

      // Determine source
      const source = this.determineSource(normalizedSender, normalizedMessage);

      return {
        type,
        amount,
        date,
        merchant,
        source,
        rawMessage: message
      };
    } catch (error) {
      console.error('SMS parsing error:', error);
      return null;
    }
  }

  /**
   * Detect if it's a debit (expense) or credit (income) transaction
   */
  private detectTransactionType(message: string): TransactionType | null {
    const lowerMessage = message.toLowerCase();

    const debitKeywords = ['debited', 'debit', 'spent', 'paid', 'payment of', 'purchase', 'withdrawn', 'used for', 'charged', 'deducted', 'transferred'];
    const creditKeywords = ['credited', 'received', 'deposit', 'refund', 'cashback', 'reversed'];

    const isDebit = debitKeywords.some(keyword => lowerMessage.includes(keyword));
    const isCredit = creditKeywords.some(keyword => lowerMessage.includes(keyword));

    if (isDebit && !isCredit) return 'expense';
    if (isCredit && !isDebit) return 'income';

    // If both or neither, try to determine from context
    if (isDebit && isCredit) {
      // Check which comes first
      const debitIndex = Math.min(...debitKeywords.map(k => {
        const idx = lowerMessage.indexOf(k);
        return idx === -1 ? Infinity : idx;
      }));
      const creditIndex = Math.min(...creditKeywords.map(k => {
        const idx = lowerMessage.indexOf(k);
        return idx === -1 ? Infinity : idx;
      }));
      return debitIndex < creditIndex ? 'expense' : 'income';
    }

    return null;
  }

  /**
   * Extract amount from SMS
   */
  private extractAmount(message: string): number | null {
    // Common patterns - order matters, more specific first
    // Examples: Rs.500.00, Rs 500, Rs.338, INR 270, ₹500, debited by 40
    const patterns = [
      // "Spent INR 270" or "Spent Rs.338" - at start of message
      /Spent\s+(?:INR|Rs\.?)\s*([\d,]+(?:\.\d{1,2})?)/i,
      // Standard currency patterns
      /Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i,
      /INR\s*([\d,]+(?:\.\d{1,2})?)/i,
      /₹\s*([\d,]+(?:\.\d{1,2})?)/,
      /Rupees?\s*([\d,]+(?:\.\d{1,2})?)/i,
      // "amount of Rs.X" or "payment of Rs.X"
      /(?:amount|payment)\s*(?:of\s*)?Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i,
      // "debited by 40" - no currency symbol (SBI UPI style)
      /debited\s+(?:by\s+)?([\d,]+(?:\.\d{1,2})?)/i,
      // "credited by 40" - no currency symbol
      /credited\s+(?:by\s+)?([\d,]+(?:\.\d{1,2})?)/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        const amountStr = match[1].replace(/,/g, '');
        const amount = parseFloat(amountStr);
        if (!isNaN(amount) && amount > 0) {
          return amount;
        }
      }
    }

    return null;
  }

  /**
   * Extract date from SMS
   */
  private extractDate(message: string): Date {
    // Common date patterns:
    // 16Dec24, 16-12-24, 16-12-2024, 16/12/24, 16 Dec 2024, 16-Dec-24
    const patterns = [
      // 16Dec24 or 16Dec2024
      /(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{2,4})/i,
      // 16-12-24 or 16-12-2024 or 16/12/24
      /(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/,
      // 2024-12-16
      /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/,
    ];

    const monthMap: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        let day: number, month: number, year: number;

        if (pattern === patterns[0]) {
          // Month name pattern
          day = parseInt(match[1]);
          month = monthMap[match[2].toLowerCase()];
          year = parseInt(match[3]);
          if (year < 100) year += 2000;
        } else if (pattern === patterns[2]) {
          // YYYY-MM-DD pattern
          year = parseInt(match[1]);
          month = parseInt(match[2]) - 1;
          day = parseInt(match[3]);
        } else {
          // DD-MM-YY pattern
          day = parseInt(match[1]);
          month = parseInt(match[2]) - 1;
          year = parseInt(match[3]);
          if (year < 100) year += 2000;
        }

        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    // Default to today if no date found
    return new Date();
  }

  /**
   * Extract merchant/payee from SMS
   */
  private extractMerchant(message: string, sender: string): string {
    // Try different patterns based on bank type - order matters
    const patterns = [
      // UPI pattern: to VPA merchant@upi or UPI/merchant@oksbi
      /(?:to\s+VPA\s+|UPI\/)([\w\.\-]+)@/i,
      // "trf to MERCHANT" pattern (SBI UPI style) - "trf to Sana Costmatic Refno"
      /trf\s+to\s+([A-Za-z0-9\s&\-\.]+?)(?:\s+Refno|\s+Ref|\.|$)/i,
      // "at MERCHANT on" pattern - "at FABCOCLOTHING on" or "At Bangalore On"
      /\s+at\s+([A-Za-z0-9\s&\-\.]+?)(?:\s+on|\s+for|\s+dated|\.|$)/i,
      // Axis style - merchant on separate line after date: "IST\nBLINKIT\nAvl"
      /IST\s*\n([A-Z0-9\s&\-\.]+?)\s*\n/i,
      // "to MERCHANT" pattern (excluding VPA)
      /(?:paid\s+to|transferred\s+to|sent\s+to)\s+([A-Za-z0-9\s&\-\.]+?)(?:\s+on|\s+for|\.|$)/i,
      // CRED pattern
      /payment.*?to\s+([A-Z]+\s+(?:Credit\s+)?Card)/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        let merchant = match[1].trim();
        // Clean up the merchant name
        merchant = merchant.replace(/\s+/g, ' ').trim();
        // Remove trailing punctuation
        merchant = merchant.replace(/[\.\,]+$/, '');
        if (merchant.length > 2 && merchant.length < 50) {
          return this.capitalizeMerchant(merchant);
        }
      }
    }

    // Fallback: use sender as source indicator
    return this.getDefaultMerchant(sender);
  }

  /**
   * Capitalize merchant name properly
   */
  private capitalizeMerchant(merchant: string): string {
    // Handle known merchants with specific casing
    const knownMerchants: Record<string, string> = {
      'swiggy': 'Swiggy',
      'zomato': 'Zomato',
      'amazon': 'Amazon',
      'flipkart': 'Flipkart',
      'uber': 'Uber',
      'ola': 'Ola',
      'netflix': 'Netflix',
      'spotify': 'Spotify',
      'gpay': 'GPay',
      'blinkit': 'Blinkit',
      'zepto': 'Zepto',
      'bigbasket': 'BigBasket',
      'myntra': 'Myntra',
      'ajio': 'Ajio',
      'nykaa': 'Nykaa',
      'paytm': 'Paytm',
      'phonepe': 'PhonePe',
      'cred': 'CRED',
      'fabcoclothing': 'FabcoClothing',
    };

    const lowerMerchant = merchant.toLowerCase();
    if (knownMerchants[lowerMerchant]) {
      return knownMerchants[lowerMerchant];
    }

    // Default: capitalize each word
    return merchant.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Get default merchant name based on sender
   */
  private getDefaultMerchant(sender: string): string {
    const upperSender = sender.toUpperCase();
    if (upperSender.includes('CRED')) return 'CRED Payment';
    if (upperSender.includes('GPAY') || upperSender.includes('GOOGLE')) return 'UPI Payment';
    return 'Transaction';
  }

  /**
   * Determine the source bank/card
   */
  private determineSource(sender: string, message: string): string {
    const upperSender = sender.toUpperCase();
    const upperMessage = message.toUpperCase();

    // Check for credit card indicators in message
    if (upperMessage.includes('CREDIT CARD') || upperMessage.includes('CC')) {
      if (upperSender.includes('HDFC') || upperMessage.includes('HDFC')) return 'HDFC CC';
      if (upperSender.includes('AXIS') || upperMessage.includes('AXIS')) return 'Axis CC';
      if (upperSender.includes('SBI') || upperMessage.includes('SBI')) return 'SBI CC';
      return 'Credit Card';
    }

    // Sender-based detection
    if (upperSender.includes('HDFCCC') || upperSender.includes('HDFCBK')) return 'HDFC';
    if (upperSender.includes('AXISCC') || upperSender.includes('AXISBK')) return 'Axis';
    if (upperSender.includes('SBI') || upperSender.includes('SBICRD')) return 'SBI';
    if (upperSender.includes('CRED')) return 'CRED';
    if (upperSender.includes('GPAY') || upperSender.includes('GOOGLE')) return 'GPay';

    return 'Bank';
  }

  /**
   * Suggest category based on merchant name
   */
  suggestCategory(merchant: string): string | null {
    const lowerMerchant = merchant.toLowerCase();

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some(keyword => lowerMerchant.includes(keyword))) {
        return category;
      }
    }

    return null;
  }

  /**
   * Get test SMS messages for development/testing
   */
  getTestMessages(): Array<{ sender: string; message: string }> {
    return [
      // Real user examples
      {
        sender: 'AXISBK',
        message: 'Spent INR 270\nAxis Bank Card no. XX1822\n02-01-26 10:14:33 IST\nBLINKIT\nAvl Limit: INR 12135.42\nNot you? SMS BLOCK 1822 to 919951860002'
      },
      {
        sender: 'HDFCCC',
        message: 'Spent Rs.338 On HDFC Bank Card 1525 At Bangalore On 2025-12-25:00:53:27.Not You? To Block+Reissue Call 18002586161/SMS BLOCK CC 1525 to 7308080808'
      },
      {
        sender: 'SBICRD',
        message: 'Rs.6,520.00 spent on your SBI Credit Card ending 5605 at FABCOCLOTHING on 01/01/26. Trxn. not done by you? Report at https://sbicard.com/Dispute'
      },
      {
        sender: 'SBICRD',
        message: 'We have received payment of Rs.28,102.00 via BBPS & the same has been credited to your SBI Credit Card. Your available limit is Rs.80,000.26.'
      },
      {
        sender: 'SBIBNK',
        message: 'Dear UPI user A/C X0393 debited by 40 on date 05Jan26 trf to Sana Costmatic Refno 637122035668 If not u? call-1800111109 for other services-18001234-SBI'
      },
      // Original examples
      {
        sender: 'SBIBNK',
        message: 'Your a/c X1234 debited by Rs.500.00 on 16Dec24 for UPI/swiggy@axl. UPI Ref 123456789'
      },
      {
        sender: 'HDFCCC',
        message: 'Your HDFC Bank Credit Card XX5678 has been used for Rs.2,500.00 at AMAZON on 16-12-2024. Avl Limit Rs.50,000'
      },
      {
        sender: 'SBIBNK',
        message: 'Rs.25,000.00 credited to your a/c X1234 on 15Dec24. Ref: Salary Dec 2024. Avl bal: Rs.50,000'
      },
    ];
  }
}
