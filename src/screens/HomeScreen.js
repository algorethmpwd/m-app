import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { parseMpesaSms } from "../utils/parser";

const AVAILABLE_ICONS = [
  "cart-outline",
  "cash-outline",
  "restaurant-outline",
  "bus-outline",
  "home-outline",
  "medical-outline",
  "phone-portrait-outline",
  "school-outline",
  "fitness-outline",
  "shirt-outline",
];

export default function HomeScreen({
  transactions,
  reviewQueue,
  intakeMethod,
  syncing,
  onSync,
  onAddTransaction,
  onDeleteTransaction,
  onAddReviewItem,
  onNavigateToTab,
}) {
  const [modalVisible, setModalVisible] = useState(false);
  const [pasteModalVisible, setPasteModalVisible] = useState(false);
  const [pastedSms, setPastedSms] = useState("");
  
  const [newTitle, setNewTitle] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [transactionType, setTransactionType] = useState("expense");
  const [selectedIcon, setSelectedIcon] = useState("cart-outline");

  // Dynamic calculations
  const totalIncome = transactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = transactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const totalBalance = totalIncome - totalExpenses;

  // Format currency helpers
  const formatAmount = (value, showSign = false) => {
    const absVal = Math.abs(value);
    const formatted = absVal.toLocaleString("en-US", {
      minimumFractionDigits: absVal % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
    if (showSign) {
      return `${value >= 0 ? "+" : "-"}${formatted}`;
    }
    return formatted;
  };

  // Group transactions by date
  const groupTransactionsByDay = (txList) => {
    const sorted = [...txList].sort((a, b) => b.date - a.date);
    const groups = {};
    
    sorted.slice(0, 10).forEach((tx) => {
      const dateStr = new Date(tx.date).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(tx);
    });
    
    return Object.entries(groups);
  };

  const handleManualAdd = () => {
    if (!newTitle.trim()) {
      Alert.alert("Required", "Please enter a transaction title.");
      return;
    }
    const amountNum = parseFloat(newAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
      return;
    }

    onAddTransaction({
      id: Date.now().toString(),
      title: newTitle.trim(),
      amount: transactionType === "expense" ? -amountNum : amountNum,
      icon: selectedIcon,
      date: Date.now(),
    });

    setNewTitle("");
    setNewAmount("");
    setModalVisible(false);
  };

  // Paste message parser trigger
  const handlePasteParse = () => {
    if (!pastedSms.trim()) {
      Alert.alert("Empty", "Please paste an M-Pesa SMS message.");
      return;
    }

    const { confidence, parsed } = parseMpesaSms(pastedSms.trim(), "M_" + Date.now());

    if (confidence === "none" || !parsed) {
      // Direct message routing to Review queue
      onAddReviewItem({
        id: "R_" + Date.now(),
        body: pastedSms.trim(),
        date: Date.now(),
      });
      Alert.alert(
        "Low Confidence / Parse Failure",
        "Could not auto-parse this message. It has been routed to the Review Tab.",
        [
          { text: "Close" },
          { text: "Go to Review", onPress: () => onNavigateToTab("Review") },
        ]
      );
    } else {
      // Success adding transaction
      onAddTransaction(parsed);
      Alert.alert("Success", `Parsed: ${parsed.title} for Ksh ${Math.abs(parsed.amount)}`);
    }

    setPastedSms("");
    setPasteModalVisible(false);
  };

  const openQuickManualAdd = (type) => {
    setTransactionType(type);
    setSelectedIcon(type === "income" ? "cash-outline" : "cart-outline");
    setNewTitle("");
    setNewAmount("");
    setModalVisible(true);
  };

  const handleSyncPress = () => {
    if (intakeMethod === "sms") {
      onSync();
    } else {
      // Opening paste modal for Play Store compliant mode
      setPasteModalVisible(true);
    }
  };

  const recentGroups = groupTransactionsByDay(transactions);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Sync Indicator Row */}
        <View style={styles.syncRow}>
          <Text style={styles.syncText}>
            Intake: {intakeMethod === "sms" ? "Auto-SMS" : "Manual Paste"}
          </Text>
          <TouchableOpacity style={styles.syncButton} onPress={handleSyncPress}>
            <Ionicons
              name="sync-outline"
              size={18}
              color={colors.accentEmber}
              style={syncing && styles.syncSpinner}
            />
            <Text style={styles.syncButtonText}>
              {syncing ? "Syncing..." : "Sync"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Hero Balance Block */}
        <View style={styles.balanceBlock}>
          <Text style={styles.currencyPrefix}>Ksh</Text>
          <Text style={styles.balanceText}>{formatAmount(totalBalance)}</Text>
        </View>

        {/* Dynamic Needs Review Warning Banner */}
        {reviewQueue.length > 0 && (
          <TouchableOpacity
            style={styles.reviewBanner}
            onPress={() => onNavigateToTab("Review")}
          >
            <View style={styles.reviewBannerContent}>
              <Ionicons name="warning-outline" size={20} color={colors.statusPending} />
              <Text style={styles.reviewBannerText}>
                {reviewQueue.length} transaction{reviewQueue.length > 1 ? "s" : ""} need{reviewQueue.length > 1 ? "" : "s"} review
              </Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => openQuickManualAdd("expense")}
          >
            <Ionicons name="arrow-up" size={22} color={colors.statusExpense} />
            <Text style={styles.actionText}>Send</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => openQuickManualAdd("income")}
          >
            <Ionicons name="arrow-down" size={22} color={colors.statusIncome} />
            <Text style={styles.actionText}>Receive</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionButton} onPress={handleSyncPress}>
            <Ionicons name="phone-portrait-outline" size={22} color={colors.accentPrimary} />
            <Text style={styles.actionText}>Sync SMS</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => Alert.alert("Wallet", "Vault stores your mobile money balances locally.")}
          >
            <Ionicons name="wallet-outline" size={22} color={colors.accentGold} />
            <Text style={styles.actionText}>Wallet</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Transactions List */}
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        {recentGroups.length > 0 ? (
          recentGroups.map(([day, items]) => (
            <View key={day} style={styles.dayGroup}>
              <Text style={styles.dayHeader}>{day.toUpperCase()}</Text>
              {items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.transactionRow}
                  onPress={() => {
                    Alert.alert(
                      item.title,
                      `Amount: Ksh ${formatAmount(item.amount, true)}\nSource: ${item.id.startsWith("M_") ? "M-Pesa SMS" : "Manual Log"}\nDate: ${new Date(item.date).toLocaleString()}`,
                      [
                        { text: "Dismiss" },
                        {
                          text: "Delete Transaction",
                          style: "destructive",
                          onPress: () => onDeleteTransaction(item.id),
                        },
                      ]
                    );
                  }}
                >
                  <View style={styles.txLeft}>
                    <View style={styles.txIconContainer}>
                      <Ionicons name={item.icon} size={18} color={colors.textPrimary} />
                    </View>
                    <View style={styles.txDetails}>
                      <Text style={styles.txTitle}>{item.title}</Text>
                      <Text style={styles.txSource}>
                        {item.id.startsWith("M_") ? "M-PESA" : "MANUAL"}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.txAmountText,
                      { color: item.amount >= 0 ? colors.statusIncome : colors.statusExpense },
                    ]}
                  >
                    {item.amount >= 0 ? "+" : "-"} {formatAmount(item.amount)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No recent transactions recorded.</Text>
            <TouchableOpacity style={styles.emptyCta} onPress={handleSyncPress}>
              <Text style={styles.emptyCtaText}>Sync your first message</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Manual Add Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>New Transaction</Text>
            
            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Shopping"
              placeholderTextColor={colors.textMuted}
              value={newTitle}
              onChangeText={setNewTitle}
              autoCorrect={false}
            />

            <Text style={styles.inputLabel}>Amount (Ksh)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              value={newAmount}
              onChangeText={setNewAmount}
              keyboardType="decimal-pad"
            />

            <Text style={styles.inputLabel}>Icon</Text>
            <View style={styles.iconSelector}>
              {AVAILABLE_ICONS.map((iconName) => (
                <TouchableOpacity
                  key={iconName}
                  style={[
                    styles.iconChoice,
                    selectedIcon === iconName && styles.iconChoiceSelected,
                  ]}
                  onPress={() => setSelectedIcon(iconName)}
                >
                  <Ionicons
                    name={iconName}
                    size={20}
                    color={selectedIcon === iconName ? colors.accentPrimary : colors.textMuted}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleManualAdd}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Paste SMS Modal (Play Store compliant backup workflow) */}
      <Modal
        visible={pasteModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setPasteModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Paste M-Pesa Receipt</Text>
            <Text style={styles.modalDesc}>
              Forward or paste the incoming SMS text message below to auto-extract details:
            </Text>

            <TextInput
              style={styles.textAreaInput}
              placeholder="Paste entire text message here..."
              placeholderTextColor={colors.textMuted}
              multiline={true}
              numberOfLines={6}
              value={pastedSms}
              onChangeText={setPastedSms}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setPasteModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handlePasteParse}
              >
                <Text style={styles.saveButtonText}>Extract & Save</Text>
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
  syncRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 16,
  },
  syncText: {
    fontFamily: "Nunito_400Regular",
    fontSize: 13,
    color: colors.textMuted,
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderHairline,
  },
  syncButtonText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 12,
    color: colors.textPrimary,
    marginLeft: 6,
  },
  syncSpinner: {
    // Basic rotation stub, can add Reanimated rotation if needed
  },
  balanceBlock: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 30,
  },
  currencyPrefix: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  balanceText: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 48,
    color: colors.accentGold,
    letterSpacing: 1,
  },
  reviewBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bgElevated,
    borderLeftWidth: 3,
    borderLeftColor: colors.statusExpense, // burnt clay left border
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    marginBottom: 24,
  },
  reviewBannerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  reviewBannerText: {
    fontFamily: "Nunito_600SemiBold",
    color: colors.textPrimary,
    fontSize: 14,
    marginLeft: 10,
  },
  sectionTitle: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 22,
    color: colors.textPrimary,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    width: "22%",
  },
  actionText: {
    fontFamily: "Nunito_600SemiBold",
    color: colors.textPrimary,
    fontSize: 11,
    marginTop: 8,
  },
  dayGroup: {
    marginBottom: 20,
  },
  dayHeader: {
    fontFamily: "DMMono_500Medium",
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 8,
  },
  transactionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: 14,
    marginBottom: 8,
    height: 56,
  },
  txLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  txIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: colors.bgSunken,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  txDetails: {
    flex: 1,
  },
  txTitle: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
    color: colors.textPrimary,
  },
  txSource: {
    fontFamily: "DMMono_500Medium",
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 2,
  },
  txAmountText: {
    fontFamily: "DMMono_500Medium",
    fontSize: 14,
    textAlign: "right",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
  },
  emptyText: {
    fontFamily: "Nunito_400Regular",
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 12,
    marginBottom: 16,
  },
  emptyCta: {
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyCtaText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 13,
    color: colors.bgBase,
  },
  // Modal Style
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
  textAreaInput: {
    backgroundColor: colors.bgSunken,
    color: colors.textPrimary,
    fontFamily: "DMMono_500Medium",
    fontSize: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: 12,
    textAlignVertical: "top",
    minHeight: 120,
  },
  iconSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 12,
  },
  iconChoice: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: colors.bgSunken,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderHairline,
  },
  iconChoiceSelected: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.bgElevated,
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
