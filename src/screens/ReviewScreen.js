import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
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
  "home-outline",
  "logo-youtube",
  "restaurant-outline",
  "car-outline",
  "gift-outline",
];

const CATEGORY_META = {
  "cart-outline": "Shopping",
  "cash-outline": "Income",
  "home-outline": "Bills & Rent",
  "logo-youtube": "Subscriptions",
  "restaurant-outline": "Food & Dining",
  "car-outline": "Transport",
  "gift-outline": "Gifts",
  "swap-horizontal": "Other",
};

export default function ReviewScreen({
  reviewQueue,
  onResolveItem,
  onDiscardItem,
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense"); // 'income' or 'expense'
  const [selectedIcon, setSelectedIcon] = useState("swap-horizontal");

  const currentItem = reviewQueue[activeIdx];

  // Calibrate inputs when the active item changes
  useEffect(() => {
    if (currentItem) {
      // Run parser on the raw SMS body to pre-fill as much as possible
      const { parsed } = parseMpesaSms(currentItem.body, currentItem.id, currentItem.date);
      if (parsed) {
        setTitle(parsed.title || "");
        setAmount(parsed.amount ? Math.abs(parsed.amount).toString() : "");
        setType(parsed.amount >= 0 ? "income" : "expense");
        setSelectedIcon(parsed.icon || "swap-horizontal");
      } else {
        // Fallbacks
        setTitle("");
        setAmount("");
        setType("expense");
        setSelectedIcon("swap-horizontal");
      }
    }
  }, [currentItem, activeIdx]);

  const handleResolve = () => {
    if (!title.trim()) {
      Alert.alert("Title Required", "Please enter a description for this transaction.");
      return;
    }
    const valAmount = parseFloat(amount);
    if (isNaN(valAmount) || valAmount <= 0) {
      Alert.alert("Amount Required", "Please enter a valid numeric amount.");
      return;
    }

    const resolvedTx = {
      id: "M_" + Date.now(), // Resolved M-Pesa transaction
      title: title.trim(),
      amount: type === "expense" ? -valAmount : valAmount,
      icon: selectedIcon,
      date: currentItem.date || Date.now(),
    };

    onResolveItem(currentItem.id, resolvedTx);

    // Adjust active index
    if (activeIdx >= reviewQueue.length - 1 && activeIdx > 0) {
      setActiveIdx(activeIdx - 1);
    }
  };

  const handleDiscard = () => {
    Alert.alert(
      "Discard Alert",
      "Are you sure you want to discard this SMS record? It will not be added to your transaction history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            onDiscardItem(currentItem.id);
            if (activeIdx >= reviewQueue.length - 1 && activeIdx > 0) {
              setActiveIdx(activeIdx - 1);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.screenHeader}>Review queue</Text>

          {reviewQueue.length > 0 && currentItem ? (
            <View>
              {/* Queue Navigation Header */}
              <View style={styles.queueHeader}>
                <Text style={styles.queueCount}>
                  Item {activeIdx + 1} of {reviewQueue.length}
                </Text>
                <View style={styles.queueNavButtons}>
                  <TouchableOpacity
                    style={[styles.navButton, activeIdx === 0 && styles.navButtonDisabled]}
                    disabled={activeIdx === 0}
                    onPress={() => setActiveIdx(activeIdx - 1)}
                  >
                    <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.navButton,
                      activeIdx === reviewQueue.length - 1 && styles.navButtonDisabled,
                    ]}
                    disabled={activeIdx === reviewQueue.length - 1}
                    onPress={() => setActiveIdx(activeIdx + 1)}
                  >
                    <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Raw Message (Sunken Box, Monospace) */}
              <Text style={styles.sectionLabel}>RAW MESSAGE SOURCE</Text>
              <View style={styles.rawBox}>
                <Text style={styles.rawText}>{currentItem.body}</Text>
                <Text style={styles.rawDate}>
                  Received: {new Date(currentItem.date).toLocaleString()}
                </Text>
              </View>

              {/* Quick Fill Form */}
              <Text style={styles.sectionLabel}>TRANSACTION DETAIL CORRECTIONS</Text>
              <View style={styles.formContainer}>
                
                {/* Title */}
                <Text style={styles.inputLabel}>Title / Recipient</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Paid Supermarket"
                  placeholderTextColor={colors.textMuted}
                  value={title}
                  onChangeText={setTitle}
                  autoCorrect={false}
                />

                {/* Amount & Type */}
                <View style={styles.amountTypeRow}>
                  <View style={{ flex: 0.48 }}>
                    <Text style={styles.inputLabel}>Amount (Ksh)</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="0.00"
                      placeholderTextColor={colors.textMuted}
                      value={amount}
                      onChangeText={setAmount}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={{ flex: 0.48 }}>
                    <Text style={styles.inputLabel}>Direction</Text>
                    <View style={styles.typeRow}>
                      <TouchableOpacity
                        style={[
                          styles.typeButton,
                          type === "expense" && styles.typeButtonActiveExpense,
                        ]}
                        onPress={() => setType("expense")}
                      >
                        <Text
                          style={[
                            styles.typeText,
                            type === "expense" && styles.typeTextActive,
                          ]}
                        >
                          Expense
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.typeButton,
                          type === "income" && styles.typeButtonActiveIncome,
                        ]}
                        onPress={() => setType("income")}
                      >
                        <Text
                          style={[
                            styles.typeText,
                            type === "income" && styles.typeTextActive,
                          ]}
                        >
                          Income
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Category Icon Picker */}
                <Text style={styles.inputLabel}>Category Icon</Text>
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
              </View>

              {/* Action Buttons */}
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity style={styles.discardButton} onPress={handleDiscard}>
                  <Ionicons name="trash-outline" size={20} color={colors.textPrimary} />
                  <Text style={styles.discardButtonText}>Discard SMS</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.resolveButton} onPress={handleResolve}>
                  <Ionicons name="checkmark-circle-outline" size={20} color={colors.bgBase} />
                  <Text style={styles.resolveButtonText}>Looks Right</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="shield-checkmark-outline" size={56} color={colors.statusIncome} />
              <Text style={styles.emptyStateTitle}>Zero Messages to Review</Text>
              <Text style={styles.emptyStateText}>
                All transaction notifications parsed with high confidence. Great job!
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  queueHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  queueCount: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
    color: colors.textPrimary,
  },
  queueNavButtons: {
    flexDirection: "row",
  },
  navButton: {
    backgroundColor: colors.bgElevated,
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  sectionLabel: {
    fontFamily: "DMMono_500Medium",
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 10,
  },
  rawBox: {
    backgroundColor: colors.bgSunken,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: 16,
    marginBottom: 20,
  },
  rawText: {
    fontFamily: "DMMono_500Medium",
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  rawDate: {
    fontFamily: "DMMono_500Medium",
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 12,
    textAlign: "right",
  },
  formContainer: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: 16,
    marginBottom: 20,
  },
  inputLabel: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 6,
    marginTop: 8,
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
  amountTypeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  typeRow: {
    flexDirection: "row",
    backgroundColor: colors.bgSunken,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: 2,
    height: 42,
  },
  typeButton: {
    flex: 0.5,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  typeButtonActiveExpense: {
    backgroundColor: colors.statusExpense,
  },
  typeButtonActiveIncome: {
    backgroundColor: colors.statusIncome,
  },
  typeText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 12,
    color: colors.textMuted,
  },
  typeTextActive: {
    color: colors.bgBase,
    fontWeight: "700",
  },
  iconSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
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
  actionButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  discardButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderHairline,
    borderRadius: 8,
    paddingVertical: 14,
    width: "48%",
  },
  discardButtonText: {
    color: colors.textPrimary,
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
    marginLeft: 8,
  },
  resolveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentPrimary,
    borderRadius: 8,
    paddingVertical: 14,
    width: "48%",
  },
  resolveButtonText: {
    color: colors.bgBase,
    fontFamily: "Nunito_700Bold",
    fontSize: 14,
    marginLeft: 8,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyStateTitle: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 24,
    color: colors.accentGold,
    marginTop: 16,
    letterSpacing: 0.5,
  },
  emptyStateText: {
    fontFamily: "Nunito_400Regular",
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 30,
    lineHeight: 18,
  },
});
