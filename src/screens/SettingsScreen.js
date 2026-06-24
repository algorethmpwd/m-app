import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { storage } from "../utils/storage";
import * as DocumentPicker from "expo-document-picker";

const CATEGORY_META = {
  "cart-outline": { label: "Shopping", color: "#818cf8" },
  "home-outline": { label: "Bills & Rent", color: "#a855f7" },
  "logo-youtube": { label: "Subscriptions", color: "#f43f5e" },
  "restaurant-outline": { label: "Food & Dining", color: "#f59e0b" },
  "car-outline": { label: "Transport", color: "#06b6d4" },
  "gift-outline": { label: "Gifts", color: "#ec4899" },
  "swap-horizontal": { label: "Other", color: "#64748b" },
};

export default function SettingsScreen({
  transactions,
  budgets,
  intakeMethod,
  reminderTime, // e.g. { hour: 20, minute: 0 }
  pinEnabled,
  onUpdateIntakeMethod,
  onUpdateBudgets,
  onUpdateReminderTime,
  onTogglePinLock,
  onRestoreData,
  onResetApp,
}) {
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [backupModalVisible, setBackupModalVisible] = useState(false);
  const [restoreModalVisible, setRestoreModalVisible] = useState(false);
  
  // Forms state
  const [editingCategory, setEditingCategory] = useState(null);
  const [budgetLimit, setBudgetLimit] = useState("");
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const [selectedRestoreUri, setSelectedRestoreUri] = useState(null);

  // Pin modal setup states
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const handleToggleSMS = (value) => {
    if (value && Platform.OS !== "android") {
      Alert.alert("Unsupported", "Auto-reading SMS inbox is Android-only due to iOS sandboxing restrictions.");
      return;
    }
    onUpdateIntakeMethod(value ? "sms" : "paste");
  };

  const handleUpdateReminder = (hour) => {
    onUpdateReminderTime({ hour, minute: 0 });
    Alert.alert("Success", `Reminder scheduled daily for ${hour > 12 ? hour - 12 : hour} ${hour >= 12 ? "PM" : "AM"}`);
  };

  const handleSaveBudget = () => {
    const limitNum = parseFloat(budgetLimit);
    if (isNaN(limitNum) || limitNum < 0) {
      Alert.alert("Invalid", "Please enter a valid monthly limit.");
      return;
    }
    const updated = { ...budgets };
    if (limitNum === 0) {
      delete updated[editingCategory];
    } else {
      updated[editingCategory] = limitNum;
    }
    onUpdateBudgets(updated);
    setBudgetModalVisible(false);
    setEditingCategory(null);
    setBudgetLimit("");
  };

  const handleExportBackup = async () => {
    if (!backupPassphrase) {
      Alert.alert("Error", "Please enter a security passphrase.");
      return;
    }
    try {
      await storage.exportBackup(transactions, budgets, { intakeMethod, reminderTime }, backupPassphrase);
      setBackupPassphrase("");
      setBackupModalVisible(false);
    } catch (e) {
      Alert.alert("Error", "Failed to export backup: " + e.message);
    }
  };

  const handleRestoreFileSelect = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        setSelectedRestoreUri(res.assets[0].uri);
        setRestoreModalVisible(true);
      }
    } catch (e) {
      Alert.alert("Error", "Failed to pick file.");
    }
  };

  const handleRestoreBackup = async () => {
    if (!restorePassphrase) {
      Alert.alert("Required", "Please enter your backup decryption passphrase.");
      return;
    }
    try {
      const restored = await storage.restoreBackup(selectedRestoreUri, restorePassphrase);
      onRestoreData(restored);
      
      setRestorePassphrase("");
      setSelectedRestoreUri(null);
      setRestoreModalVisible(false);
      Alert.alert("Success", "Backup restored successfully!");
    } catch (e) {
      Alert.alert("Restore Failed", e.message);
    }
  };

  const handleExportCsv = () => {
    Alert.alert(
      "Unencrypted Export",
      "CSV exports are written in plain text and are not encrypted. Make sure you store it somewhere safe.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Export CSV",
          onPress: async () => {
            try {
              await storage.exportCsv(transactions);
            } catch (e) {
              Alert.alert("Error", "CSV Export failed: " + e.message);
            }
          },
        },
      ]
    );
  };

  const handlePinSetup = () => {
    if (newPin.length !== 4 || confirmPin.length !== 4) {
      Alert.alert("Required", "Please enter a 4-digit PIN.");
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert("Mismatch", "The PINs you entered do not match.");
      return;
    }
    onTogglePinLock(newPin);
    setNewPin("");
    setConfirmPin("");
    setPinModalVisible(false);
  };

  const handleTogglePin = () => {
    if (pinEnabled) {
      // Disable PIN lock
      Alert.alert(
        "Disable App Lock",
        "Are you sure you want to disable the App Lock PIN? Anyone with access to your device can view your finances.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Disable",
            style: "destructive",
            onPress: () => onTogglePinLock(null),
          },
        ]
      );
    } else {
      setPinModalVisible(true);
    }
  };

  const handleClearDatabase = () => {
    Alert.alert(
      "Danger: Wipe Application Data",
      "This will permanently delete all transaction records, category limits, PIN credentials, and settings. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Wipe All Data",
          style: "destructive",
          onPress: onResetApp,
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.screenHeader}>Settings</Text>

        {/* Sync Settings */}
        <Text style={styles.sectionLabel}>TRANSACTION INTAKE</Text>
        <View style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.settingTitle}>Auto-scan SMS inbox</Text>
              <Text style={styles.settingDesc}>
                Scan your text messages locally to automatically import receipts.
              </Text>
            </View>
            <Switch
              value={intakeMethod === "sms"}
              onValueChange={handleToggleSMS}
              trackColor={{ false: colors.borderHairline, true: colors.accentPrimary }}
              thumbColor={colors.textPrimary}
            />
          </View>
        </View>

        {/* Security Settings */}
        <Text style={styles.sectionLabel}>SECURITY & APP LOCK</Text>
        <View style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Enforce PIN App Lock</Text>
              <Text style={styles.settingDesc}>
                Require 4-digit PIN whenever you open or resume Vault.
              </Text>
            </View>
            <Switch
              value={pinEnabled}
              onValueChange={handleTogglePin}
              trackColor={{ false: colors.borderHairline, true: colors.accentPrimary }}
              thumbColor={colors.textPrimary}
            />
          </View>
        </View>

        {/* Daily reminders */}
        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
        <View style={styles.settingsCard}>
          <Text style={styles.settingTitle}>Daily Review Reminder</Text>
          <Text style={styles.settingDesc}>
            Pick a time to receive a push notification reminder to sync and review your logs:
          </Text>
          <View style={styles.timeRow}>
            {[18, 19, 20, 21, 22].map((hour) => (
              <TouchableOpacity
                key={hour}
                style={[
                  styles.timeButton,
                  reminderTime?.hour === hour && styles.timeButtonActive,
                ]}
                onPress={() => handleUpdateReminder(hour)}
              >
                <Text
                  style={[
                    styles.timeButtonText,
                    reminderTime?.hour === hour && styles.timeButtonTextActive,
                  ]}
                >
                  {hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Budget Manager */}
        <Text style={styles.sectionLabel}>BUDGET MANAGER</Text>
        <View style={styles.settingsCard}>
          <Text style={styles.settingTitle}>Set Category Limits</Text>
          <Text style={styles.settingDesc}>
            Manage monthly limits. Tap any category to define or clear monthly limits:
          </Text>

          <View style={styles.budgetGrid}>
            {Object.entries(CATEGORY_META).map(([iconName, meta]) => {
              const limit = budgets[iconName];
              return (
                <TouchableOpacity
                  key={iconName}
                  style={styles.budgetLimitButton}
                  onPress={() => {
                    setEditingCategory(iconName);
                    setBudgetLimit(limit ? limit.toString() : "");
                    setBudgetModalVisible(true);
                  }}
                >
                  <View style={styles.budgetLimitLeft}>
                    <Ionicons name={iconName} size={18} color={meta.color} />
                    <Text style={styles.budgetLimitLabel}>{meta.label}</Text>
                  </View>
                  <Text style={styles.budgetLimitValue}>
                    {limit ? `Ksh ${limit.toLocaleString()}` : "Not Set"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Backup & Export */}
        <Text style={styles.sectionLabel}>BACKUP & EXPORT</Text>
        <View style={styles.settingsCard}>
          <TouchableOpacity
            style={styles.backupButton}
            onPress={() => setBackupModalVisible(true)}
          >
            <Ionicons name="cloud-upload-outline" size={20} color={colors.accentGold} />
            <Text style={styles.backupButtonText}>Export Encrypted Backup</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backupButton} onPress={handleRestoreFileSelect}>
            <Ionicons name="cloud-download-outline" size={20} color={colors.accentPrimary} />
            <Text style={styles.backupButtonText}>Restore Encryption Backup</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backupButton} onPress={handleExportCsv}>
            <Ionicons name="document-text-outline" size={20} color={colors.textPrimary} />
            <Text style={styles.backupButtonText}>Export Plain Text CSV</Text>
          </TouchableOpacity>
        </View>

        {/* Reset App */}
        <Text style={styles.sectionLabel}>DANGER ZONE</Text>
        <View style={styles.settingsCard}>
          <TouchableOpacity style={styles.dangerZoneButton} onPress={handleClearDatabase}>
            <Ionicons name="trash-outline" size={20} color={colors.bgBase} />
            <Text style={styles.dangerZoneText}>Wipe Application Data</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* PIN Setup Modal */}
      <Modal
        visible={pinModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPinModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Setup PIN App Lock</Text>
            
            <Text style={styles.inputLabel}>Enter 4-Digit PIN</Text>
            <TextInput
              style={styles.textInputPin}
              placeholder="1234"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry={true}
              value={newPin}
              onChangeText={setNewPin}
            />

            <Text style={styles.inputLabel}>Confirm PIN</Text>
            <TextInput
              style={styles.textInputPin}
              placeholder="1234"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry={true}
              value={confirmPin}
              onChangeText={setConfirmPin}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setPinModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handlePinSetup}>
                <Text style={styles.saveButtonText}>Set PIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Budget Limit Setup Modal */}
      <Modal
        visible={budgetModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setBudgetModalVisible(false);
          setEditingCategory(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>
              {editingCategory && (CATEGORY_META[editingCategory] || CATEGORY_META["swap-horizontal"]).label} Budget
            </Text>
            
            <Text style={styles.modalDesc}>
              Enter monthly spending limit for this category. Enter 0 to remove the budget.
            </Text>

            <Text style={styles.inputLabel}>Monthly Limit (Ksh)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={budgetLimit}
              onChangeText={setBudgetLimit}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setBudgetModalVisible(false);
                  setEditingCategory(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveBudget}>
                <Text style={styles.saveButtonText}>Save Budget</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Backup Passphrase Modal */}
      <Modal
        visible={backupModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setBackupModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Create Encrypted Backup</Text>
            <Text style={styles.modalDesc}>
              Enter a security passphrase to encrypt your backup file. You will need this key to restore your records.
            </Text>

            <Text style={styles.inputLabel}>Passphrase</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Min 6 characters"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={true}
              value={backupPassphrase}
              onChangeText={setBackupPassphrase}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setBackupModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleExportBackup}>
                <Text style={styles.saveButtonText}>Export</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Restore Passphrase Modal */}
      <Modal
        visible={restoreModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setRestoreModalVisible(false);
          setSelectedRestoreUri(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Decrypt & Restore Backup</Text>
            <Text style={styles.modalDesc}>
              Enter the passphrase used when creating this backup file to restore your account details:
            </Text>

            <Text style={styles.inputLabel}>Passphrase</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Passphrase"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={true}
              value={restorePassphrase}
              onChangeText={setRestorePassphrase}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setRestoreModalVisible(false);
                  setSelectedRestoreUri(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleRestoreBackup}>
                <Text style={styles.saveButtonText}>Restore</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  screenHeader: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 28,
    color: colors.accentGold,
    letterSpacing: 1,
    marginVertical: 20,
  },
  sectionLabel: {
    fontFamily: "DMMono_500Medium",
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 18,
  },
  settingsCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: 16,
    marginBottom: 10,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  settingTitle: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 15,
    color: colors.textPrimary,
  },
  settingDesc: {
    fontFamily: "Nunito_400Regular",
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
    marginTop: 4,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  timeButton: {
    flex: 0.18,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: colors.bgSunken,
  },
  timeButtonActive: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  timeButtonText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 11,
    color: colors.textMuted,
  },
  timeButtonTextActive: {
    color: colors.bgBase,
    fontWeight: "700",
  },
  budgetGrid: {
    marginTop: 12,
  },
  budgetLimitButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHairline,
  },
  budgetLimitLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  budgetLimitLabel: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
    color: colors.textPrimary,
    marginLeft: 10,
  },
  budgetLimitValue: {
    fontFamily: "DMMono_500Medium",
    fontSize: 13,
    color: colors.accentGold,
  },
  backupButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHairline,
  },
  backupButtonText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
    color: colors.textPrimary,
    marginLeft: 12,
  },
  dangerZoneButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.statusExpense,
    paddingVertical: 14,
    borderRadius: 8,
  },
  dangerZoneText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 14,
    color: colors.bgBase,
    marginLeft: 10,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(14, 13, 12, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContainer: {
    width: "100%",
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: 24,
  },
  modalTitle: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 24,
    color: colors.accentGold,
    marginBottom: 16,
    textAlign: "center",
  },
  modalDesc: {
    fontFamily: "Nunito_400Regular",
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 16,
    lineHeight: 18,
    textAlign: "center",
  },
  inputLabel: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 6,
    marginTop: 12,
  },
  textInput: {
    backgroundColor: colors.bgSunken,
    color: colors.textPrimary,
    fontFamily: "Nunito_400Regular",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  textInputPin: {
    backgroundColor: colors.bgSunken,
    color: colors.accentGold,
    fontFamily: "DMMono_500Medium",
    fontSize: 20,
    textAlign: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    paddingVertical: 10,
    letterSpacing: 8,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: colors.borderHairline,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    width: "48%",
  },
  cancelButtonText: {
    color: colors.textPrimary,
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    width: "48%",
  },
  saveButtonText: {
    color: colors.bgBase,
    fontFamily: "Nunito_700Bold",
    fontSize: 14,
  },
});
