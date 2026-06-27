import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

// Keys
const TX_KEY = "vault_transactions";
const BUDGET_KEY = "vault_budgets";
const SETTINGS_KEY = "vault_settings";
const PIN_KEY = "vault_lock_pin";
const REVIEW_KEY = "vault_review_queue";
const ONBOARDING_COMPLETE_KEY = "vault_onboarding_complete";

// Base64 Alphabet and Pure JS Encoder/Decoder
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const encodeBase64 = (str) => {
  let bytes = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i));
  }
  let result = "", i, l = bytes.length;
  for (i = 2; i < l; i += 3) {
    result += CHARS[bytes[i - 2] >> 2];
    result += CHARS[((bytes[i - 2] & 3) << 4) | (bytes[i - 1] >> 4)];
    result += CHARS[((bytes[i - 1] & 15) << 2) | (bytes[i] >> 6)];
    result += CHARS[bytes[i] & 63];
  }
  if (i - 2 === l - 1) {
    result += CHARS[bytes[i - 2] >> 2];
    result += CHARS[(bytes[i - 2] & 3) << 4];
    result += "==";
  } else if (i - 2 === l - 2) {
    result += CHARS[bytes[i - 2] >> 2];
    result += CHARS[((bytes[i - 2] & 3) << 4) | (bytes[i - 1] >> 4)];
    result += CHARS[(bytes[i - 1] & 15) << 2];
    result += "=";
  }
  return result;
};

const decodeBase64 = (str) => {
  let bufferLength = str.length * 0.75,
  len = str.length, i, p = 0,
  encoded1, encoded2, encoded3, encoded4;
  if (str[str.length - 1] === "=") {
    bufferLength--;
    if (str[str.length - 2] === "=") {
      bufferLength--;
    }
  }
  let bytes = new Uint8Array(bufferLength);
  for (i = 0; i < len; i += 4) {
    encoded1 = CHARS.indexOf(str[i]);
    encoded2 = CHARS.indexOf(str[i + 1]);
    encoded3 = CHARS.indexOf(str[i + 2]);
    encoded4 = CHARS.indexOf(str[i + 3]);
    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    bytes[p++] = ((encoded3 & 3) << 6) | encoded4;
  }
  let result = "";
  for(let j=0; j<bytes.length; j++) {
    result += String.fromCharCode(bytes[j]);
  }
  return result;
};

// Encryption helpers
const xorEncryptDecrypt = (text, key) => {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
};

export const storage = {
  // Transactions
  getTransactions: async () => {
    const data = await AsyncStorage.getItem(TX_KEY);
    return data ? JSON.parse(data) : null;
  },
  saveTransactions: async (txs) => {
    await AsyncStorage.setItem(TX_KEY, JSON.stringify(txs));
  },

  // Review Queue
  getReviewQueue: async () => {
    const data = await AsyncStorage.getItem(REVIEW_KEY);
    return data ? JSON.parse(data) : [];
  },
  saveReviewQueue: async (queue) => {
    await AsyncStorage.setItem(REVIEW_KEY, JSON.stringify(queue));
  },

  // Budgets
  getBudgets: async () => {
    const data = await AsyncStorage.getItem(BUDGET_KEY);
    return data ? JSON.parse(data) : {};
  },
  saveBudgets: async (budgets) => {
    await AsyncStorage.setItem(BUDGET_KEY, JSON.stringify(budgets));
  },

  // Settings
  getSettings: async () => {
    const data = await AsyncStorage.getItem(SETTINGS_KEY);
    return data ? JSON.parse(data) : null;
  },
  saveSettings: async (settings) => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },

  // Pin Lock (Secure)
  getPin: async () => {
    try {
      return await SecureStore.getItemAsync(PIN_KEY);
    } catch {
      return null;
    }
  },
  savePin: async (pin) => {
    await SecureStore.setItemAsync(PIN_KEY, pin);
  },
  deletePin: async () => {
    await SecureStore.deleteItemAsync(PIN_KEY);
  },
  getGeminiKey: async () => {
    try {
      return await SecureStore.getItemAsync("gemini_api_key");
    } catch {
      return null;
    }
  },
  saveGeminiKey: async (key) => {
    await SecureStore.setItemAsync("gemini_api_key", key);
  },
  deleteGeminiKey: async () => {
    await SecureStore.deleteItemAsync("gemini_api_key");
  },

  // Onboarding Complete flag
  getOnboardingComplete: async () => {
    const complete = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
    return complete === "true";
  },
  setOnboardingComplete: async (complete) => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, complete ? "true" : "false");
  },

  // Export Backups (JSON encrypted)
  exportBackup: async (transactions, budgets, settings, passphrase) => {
    const rawBackup = JSON.stringify({ transactions, budgets, settings });
    const encrypted = encodeBase64(xorEncryptDecrypt(rawBackup, passphrase));
    
    const fileUri = FileSystem.documentDirectory + "vault_backup.json";
    await FileSystem.writeAsStringAsync(fileUri, encrypted);
    
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: "Vault Security Backup",
    });
  },

  // Restore Backup
  restoreBackup: async (fileUri, passphrase) => {
    const fileContent = await FileSystem.readAsStringAsync(fileUri);
    try {
      const decrypted = xorEncryptDecrypt(decodeBase64(fileContent.trim()), passphrase);
      const data = JSON.parse(decrypted);
      if (data.transactions && data.budgets && data.settings) {
        return data;
      }
      throw new Error("Invalid backup format");
    } catch (e) {
      throw new Error("Failed to restore: Check if your passphrase is correct.");
    }
  },

  // Export CSV (unencrypted)
  exportCsv: async (transactions) => {
    let csv = "ID,Date,Title,Amount,Icon\n";
    transactions.forEach((t) => {
      const formattedDate = new Date(t.date).toISOString().split("T")[0];
      const titleClean = t.title.replace(/"/g, '""');
      csv += `${t.id},${formattedDate},"${titleClean}",${t.amount},${t.icon}\n`;
    });

    const fileUri = FileSystem.documentDirectory + "vault_export.csv";
    await FileSystem.writeAsStringAsync(fileUri, csv);
    
    await Sharing.shareAsync(fileUri, {
      mimeType: "text/csv",
      dialogTitle: "Export Transactions CSV",
    });
  },
  
  clearAll: async () => {
    await AsyncStorage.multiRemove([TX_KEY, BUDGET_KEY, SETTINGS_KEY, REVIEW_KEY, ONBOARDING_COMPLETE_KEY]);
    await SecureStore.deleteItemAsync(PIN_KEY);
  }
};
