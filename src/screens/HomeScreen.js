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
  Linking,
  Share,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { parseMpesaSms } from "../utils/parser";
import { classifyTransaction } from "../utils/classifier";
import { storage } from "../utils/storage";
import {
  detectRecurringBills,
  predictOverdraft,
  buildUtilityDirectory,
  calculateDailyBurnRate,
} from "../utils/financeUtils";

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
  const [aiParsing, setAiParsing] = useState(false);
  
  const [newTitle, setNewTitle] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [transactionType, setTransactionType] = useState("expense");
  const [selectedIcon, setSelectedIcon] = useState("cart-outline");
  const [modalMode, setModalMode] = useState("log"); // "log" or "direct"
  const [directPhone, setDirectPhone] = useState("");
  const [myPhoneNumber, setMyPhoneNumber] = useState("");

  // Dynamic calculations
  const totalIncome = transactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = transactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  // Latest parsed actual balances from Safaricom / Bank SMS messages
  const latestMpesaTx = transactions.find((t) => t.mpesaBalance !== undefined);
  const latestZiidiTx = transactions.find((t) => t.ziidiBalance !== undefined);
  const latestFulizaTx = transactions.find((t) => t.fulizaBalance !== undefined);

  // Fallbacks: if no SMS transaction has the actual balance, calculate historically
  const mpesaCashFallback = totalIncome - totalExpenses;
  const ziidiFallback = transactions
    .filter((t) => t.isSavings || (t.title && t.title.toLowerCase().includes("ziidi")))
    .reduce((sum, t) => sum - t.amount, 0);

  const mpesaCashBalance = latestMpesaTx ? latestMpesaTx.mpesaBalance : mpesaCashFallback;
  const ziidiBalance = latestZiidiTx ? latestZiidiTx.ziidiBalance : ziidiFallback;
  const fulizaBalance = latestFulizaTx ? latestFulizaTx.fulizaBalance : 0;

  // Map totalBalance to mpesaCashBalance for UI rendering
  const totalBalance = mpesaCashBalance;

  // Net Available Balance
  const netBalance = mpesaCashBalance + ziidiBalance - fulizaBalance;

  // Analytics calculations
  const recurringBills = detectRecurringBills(transactions);
  const dailyBurnRate = calculateDailyBurnRate(transactions);
  const overdraftForecast = predictOverdraft(mpesaCashBalance, recurringBills, dailyBurnRate);
  const utilityDirectory = buildUtilityDirectory(transactions);

  // Format currency helpers (handles negative numbers correctly)
  const formatAmount = (value, showSign = false) => {
    const absVal = Math.abs(value);
    const formatted = absVal.toLocaleString("en-US", {
      minimumFractionDigits: absVal % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
    if (showSign) {
      return `${value >= 0 ? "+" : "-"}${formatted}`;
    }
    return `${value < 0 ? "-" : ""}${formatted}`;
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
  const handlePasteParse = async () => {
    if (!pastedSms.trim()) {
      Alert.alert("Empty", "Please paste an M-Pesa SMS message or write a transaction description.");
      return;
    }

    const { confidence, parsed } = parseMpesaSms(pastedSms.trim(), "M_" + Date.now());

    if (confidence === "high" && parsed) {
      if (parsed.amount < 0) {
        const mlIcon = classifyTransaction(parsed.title, transactions);
        if (mlIcon) {
          parsed.icon = mlIcon;
        }
      }
      onAddTransaction(parsed);
      setPastedSms("");
      setPasteModalVisible(false);
      Alert.alert("Success", `Parsed: ${parsed.title} for Ksh ${Math.abs(parsed.amount)}`);
    } else {
      // Standard regex failed. Cascade to AI Natural Language extraction!
      const apiKey = await storage.getGeminiKey();
      if (!apiKey) {
        // Fallback: put in review queue if no API key is linked
        onAddReviewItem({
          id: "R_" + Date.now(),
          body: pastedSms.trim(),
          date: Date.now(),
        });
        Alert.alert(
          "Review Queue",
          "Standard receipt format not recognized. Message sent to Review tab. Link your Gemini API key in the AI Tab to enable instant AI parsing."
        );
        setPastedSms("");
        setPasteModalVisible(false);
        return;
      }

      setAiParsing(true);
      try {
        const prompt = `You are a financial statement parsing engine. Read this natural language statement and extract transaction details:
"${pastedSms}"

Return ONLY a valid JSON object with the following structure:
{
  "title": "Cleaned name of merchant/place/person (max 25 characters)",
  "amount": number (positive for income/deposits, negative for expenses/withdrawals),
  "category": "icon-name (one of 'cart-outline', 'home-outline', 'logo-youtube', 'restaurant-outline', 'car-outline', 'gift-outline', 'send', 'wallet', 'trending-up-outline', 'swap-horizontal')"
}

IMPORTANT: Do not return any markdown code block wrap (such as \`\`\`json) or any comments. Just the raw JSON string starting with { and ending with }.`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
            }),
          }
        );

        const json = await response.json();
        const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
        let clean = rawText.trim();
        if (clean.startsWith("```")) {
          clean = clean.replace(/^```[a-z]*\n/i, "").replace(/\n```$/i, "").trim();
        }

        const aiParsed = JSON.parse(clean);
        if (aiParsed && aiParsed.title && typeof aiParsed.amount === "number") {
          const newTx = {
            id: "M_AI_" + Date.now(),
            title: aiParsed.title,
            amount: aiParsed.amount,
            icon: aiParsed.category || "swap-horizontal",
            date: Date.now(),
            source: "manual",
          };
          onAddTransaction(newTx);
          setPastedSms("");
          setPasteModalVisible(false);
          Alert.alert("AI Extraction Complete", `Auto-detected: ${newTx.title} for Ksh ${Math.abs(newTx.amount)}`);
        } else {
          Alert.alert("AI Extraction Error", "AI scanned the input but could not extract structured transaction details.");
        }
      } catch (err) {
        Alert.alert("AI Extraction Failed", err.message);
      } finally {
        setAiParsing(false);
      }
    }
  };

  const openQuickManualAdd = (type) => {
    setTransactionType(type);
    setSelectedIcon(type === "income" ? "cash-outline" : "cart-outline");
    setNewTitle("");
    setNewAmount("");
    setModalMode("log");
    setDirectPhone("");
    setModalVisible(true);
  };

  const handleDirectSend = async () => {
    const amountNum = parseFloat(newAmount);
    const cleanedPhone = directPhone.trim().replace(/^\+254/, "0");
    if (!cleanedPhone || !/^(07|01)\d{8}$/.test(cleanedPhone)) {
      Alert.alert("Invalid Phone Number", "Please enter a valid M-Pesa phone number (e.g. 0712345678).");
      return;
    }
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
      return;
    }

    const ussdUrl = `tel:*334*1*1*${cleanedPhone}*${amountNum}%23`;

    try {
      setModalVisible(false);
      await Linking.openURL(ussdUrl);
    } catch (e) {
      Alert.alert(
        "USSD Dialer",
        `Could not dial automatically. Please dial manually:\n*334*1*1*${cleanedPhone}*${amountNum}#`
      );
    }
  };

  const handleShareRequest = async () => {
    const amountNum = parseFloat(newAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
      return;
    }

    const phoneClean = myPhoneNumber.trim().replace(/^\+254/, "0");
    const phoneStr = phoneClean ? ` to ${phoneClean}` : "";
    const ussdStr = phoneClean ? ` (dial *334*1*1*${phoneClean}*${amountNum}#)` : "";
    const message = `Hi, please send me Ksh ${amountNum} on M-Pesa${phoneStr}${ussdStr}. Thank you!`;

    try {
      setModalVisible(false);
      await Share.share({
        message: message,
      });
    } catch (error) {
      Alert.alert("Error Sharing", error.message);
    }
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
          <Text style={styles.currencyPrefix}>Net Available Balance</Text>
          <Text style={[styles.balanceText, netBalance < 0 && { color: colors.statusExpense }]}>
            Ksh {formatAmount(netBalance)}
          </Text>
        </View>

        {/* Sub-Balances Breakdown Row */}
        <View style={styles.breakdownContainer}>
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownLabel}>M-Pesa Cash</Text>
            <Text style={styles.breakdownValue}>{formatAmount(totalBalance)}</Text>
          </View>
          
          <View style={styles.breakdownDivider} />
          
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownLabel}>Ziidi MMF</Text>
            <Text style={[styles.breakdownValue, { color: colors.statusIncome }]}>
              {formatAmount(ziidiBalance)}
            </Text>
          </View>
          
          <View style={styles.breakdownDivider} />
          
          <View style={styles.breakdownItem}>
            <Text style={styles.breakdownLabel}>Fuliza Debt</Text>
            <Text style={[styles.breakdownValue, fulizaBalance > 0 ? { color: colors.statusExpense } : {}]}>
              {formatAmount(fulizaBalance)}
            </Text>
        </View>

        {/* Overdraft Warning Banner */}
        {overdraftForecast.willOverdraft && (
          <View style={styles.overdraftBanner}>
            <Ionicons name="alert-circle" size={18} color={colors.statusExpense} style={{ marginRight: 8 }} />
            <Text style={styles.overdraftBannerText}>
              Fuliza Warning: Your M-Pesa balance is predicted to trigger a Fuliza overdraft on {overdraftForecast.overdraftDate} due to upcoming recurring bills.
            </Text>
          </View>
        )}

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
        <Text style={styles.sectionTitle}>Statement Import Actions</Text>
        <View style={styles.importActionsContainer}>
          <TouchableOpacity
            style={styles.primaryImportButton}
            onPress={handleSyncPress}
          >
            <Ionicons name="sync-outline" size={20} color={colors.bgBase} />
            <Text style={styles.primaryImportText}>Sync Inbox Messages</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.secondaryImportButton}
            onPress={() => setPasteModalVisible(true)}
          >
            <Ionicons name="clipboard-outline" size={20} color={colors.accentPrimary} />
            <Text style={styles.secondaryImportText}>Paste Statement</Text>
          </TouchableOpacity>
        </View>

        {/* Cashflow Outlook Card */}
        <Text style={styles.sectionTitle}>Cashflow Outlook</Text>
        <View style={styles.outlookCard}>
          <View style={styles.outlookHeader}>
            <Ionicons name="calendar-outline" size={18} color={colors.accentGold} style={{ marginRight: 6 }} />
            <Text style={styles.outlookTitle}>Upcoming Recurring Bills</Text>
          </View>
          
          {recurringBills.length === 0 ? (
            <Text style={styles.outlookEmptyText}>No repeating monthly or weekly bills detected yet.</Text>
          ) : (
            recurringBills.slice(0, 3).map((bill, index) => (
              <View key={index} style={styles.billRow}>
                <View style={styles.billLeft}>
                  <Text style={styles.billName}>{bill.title}</Text>
                  <Text style={styles.billFrequency}>
                    Due in {bill.daysLeft} day{bill.daysLeft !== 1 ? "s" : ""} ({bill.frequency})
                  </Text>
                </View>
                <Text style={styles.billAmount}>-Ksh {formatAmount(bill.amount)}</Text>
              </View>
            ))
          )}
        </View>

        {/* Till & Paybill Directory */}
        <Text style={styles.sectionTitle}>Till & Paybill Directory</Text>
        <View style={styles.directoryCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.directoryScroll}>
            {utilityDirectory.paybills.length === 0 && utilityDirectory.tills.length === 0 ? (
              <Text style={styles.directoryEmptyText}>No Paybill or Till transactions found in statement logs.</Text>
            ) : null}

            {/* Paybill List */}
            {utilityDirectory.paybills.slice(0, 5).map((paybill, index) => (
              <TouchableOpacity
                key={`p-${index}`}
                style={styles.directoryItem}
                onPress={() => {
                  const ussd = `*334*2*1*${paybill.number}*${paybill.account}#`;
                  Alert.alert(
                    "Quick Dial Info",
                    `Paybill Number: ${paybill.number}\nAccount: ${paybill.account}\n\nRecommended Safaricom Quick Dial Code:\n${ussd}`,
                    [
                      { text: "Copy USSD Code", onPress: () => Clipboard.setStringAsync(ussd) },
                      { text: "OK" }
                    ]
                  );
                }}
              >
                <Ionicons name="card" size={20} color={colors.accentPrimary} />
                <Text style={styles.directoryItemTitle} numberOfLines={1}>{paybill.name}</Text>
                <Text style={styles.directoryItemSubtitle}>Paybill {paybill.number}</Text>
              </TouchableOpacity>
            ))}

            {/* Till List */}
            {utilityDirectory.tills.slice(0, 5).map((till, index) => (
              <TouchableOpacity
                key={`t-${index}`}
                style={styles.directoryItem}
                onPress={() => {
                  const ussd = `*334*2*2*${till.number}#`;
                  Alert.alert(
                    "Quick Dial Info",
                    `Till Number: ${till.number}\n\nRecommended Safaricom Quick Dial Code:\n${ussd}`,
                    [
                      { text: "Copy USSD Code", onPress: () => Clipboard.setStringAsync(ussd) },
                      { text: "OK" }
                    ]
                  );
                }}
              >
                <Ionicons name="cart" size={20} color={colors.accentGold} />
                <Text style={styles.directoryItemTitle} numberOfLines={1}>{till.name}</Text>
                <Text style={styles.directoryItemSubtitle}>Till {till.number}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
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
            <Text style={styles.modalTitle}>
              {transactionType === "expense" ? "Send / Expense" : "Receive / Income"}
            </Text>

            {/* Modal mode selector */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabButton, modalMode === "log" && styles.tabButtonActive]}
                onPress={() => setModalMode("log")}
              >
                <Text style={[styles.tabButtonText, modalMode === "log" && styles.tabButtonTextActive]}>
                  Local Log Only
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, modalMode === "direct" && styles.tabButtonActive]}
                onPress={() => setModalMode("direct")}
              >
                <Text style={[styles.tabButtonText, modalMode === "direct" && styles.tabButtonTextActive]}>
                  {transactionType === "expense" ? "M-Pesa Direct" : "Request Share"}
                </Text>
              </TouchableOpacity>
            </View>

            {modalMode === "log" ? (
              <View>
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
              </View>
            ) : (
              <View>
                {transactionType === "expense" ? (
                  <View>
                    <Text style={styles.inputLabel}>Recipient Phone Number</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. 0712345678"
                      placeholderTextColor={colors.textMuted}
                      value={directPhone}
                      onChangeText={setDirectPhone}
                      keyboardType="phone-pad"
                      autoCorrect={false}
                    />

                    <Text style={styles.inputLabel}>Amount to Send (Ksh)</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="0.00"
                      placeholderTextColor={colors.textMuted}
                      value={newAmount}
                      onChangeText={setNewAmount}
                      keyboardType="decimal-pad"
                    />
                  </View>
                ) : (
                  <View>
                    <Text style={styles.inputLabel}>Your Phone Number (Optional)</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. 0712345678"
                      placeholderTextColor={colors.textMuted}
                      value={myPhoneNumber}
                      onChangeText={setMyPhoneNumber}
                      keyboardType="phone-pad"
                      autoCorrect={false}
                    />

                    <Text style={styles.inputLabel}>Amount to Request (Ksh)</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="0.00"
                      placeholderTextColor={colors.textMuted}
                      value={newAmount}
                      onChangeText={setNewAmount}
                      keyboardType="decimal-pad"
                    />
                  </View>
                )}
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={
                  modalMode === "log"
                    ? handleManualAdd
                    : transactionType === "expense"
                    ? handleDirectSend
                    : handleShareRequest
                }
              >
                <Text style={styles.saveButtonText}>
                  {modalMode === "log" ? "Save Log" : transactionType === "expense" ? "Dial USSD" : "Share"}
                </Text>
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

            {aiParsing ? (
              <View style={styles.modalLoadingContainer}>
                <ActivityIndicator size="large" color={colors.accentPrimary} />
                <Text style={styles.modalLoadingText}>AI Agent is extracting details...</Text>
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.textAreaInput}
                  placeholder="Paste receipt SMS or type description..."
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
              </>
            )}
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
  importActionsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  primaryImportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentPrimary,
    paddingVertical: 12,
    borderRadius: 8,
    width: "58%",
  },
  primaryImportText: {
    fontFamily: "Nunito_700Bold",
    color: colors.bgBase,
    fontSize: 13,
    marginLeft: 6,
  },
  secondaryImportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    paddingVertical: 12,
    borderRadius: 8,
    width: "38%",
  },
  secondaryImportText: {
    fontFamily: "Nunito_600SemiBold",
    color: colors.accentPrimary,
    fontSize: 13,
    marginLeft: 6,
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
  modalLoadingContainer: {
    paddingVertical: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  modalLoadingText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 12,
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
  breakdownContainer: {
    flexDirection: "row",
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 24,
    justifyContent: "space-around",
    alignItems: "center",
  },
  breakdownItem: {
    alignItems: "center",
    flex: 1,
  },
  breakdownLabel: {
    fontFamily: "Nunito_400Regular",
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 4,
  },
  breakdownValue: {
    fontFamily: "DMMono_500Medium",
    fontSize: 13,
    color: colors.textPrimary,
  },
  breakdownDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.borderHairline,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: colors.bgSunken,
    borderRadius: 8,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.borderHairline,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 6,
  },
  tabButtonActive: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderHairline,
  },
  tabButtonText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 13,
    color: colors.textMuted,
  },
  tabButtonTextActive: {
    color: colors.accentGold,
  },
  overdraftBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(194, 80, 46, 0.1)",
    borderWidth: 1,
    borderColor: colors.statusExpense,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  overdraftBannerText: {
    flex: 1,
    fontFamily: "Nunito_600SemiBold",
    fontSize: 12,
    color: colors.statusExpense,
    lineHeight: 16,
  },
  outlookCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: 16,
    marginBottom: 24,
  },
  outlookHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  outlookTitle: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 16,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  outlookEmptyText: {
    fontFamily: "Nunito_400Regular",
    fontSize: 12,
    color: colors.textMuted,
  },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHairline,
    paddingVertical: 10,
  },
  billLeft: {
    flex: 1,
  },
  billName: {
    fontFamily: "Nunito_700Bold",
    fontSize: 14,
    color: colors.textPrimary,
  },
  billFrequency: {
    fontFamily: "Nunito_400Regular",
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  billAmount: {
    fontFamily: "DMMono_500Medium",
    fontSize: 13,
    color: colors.statusExpense,
  },
  directoryCard: {
    marginBottom: 24,
  },
  directoryScroll: {
    paddingRight: 16,
  },
  directoryEmptyText: {
    fontFamily: "Nunito_400Regular",
    fontSize: 12,
    color: colors.textMuted,
    marginLeft: 4,
  },
  directoryItem: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    borderRadius: 10,
    padding: 12,
    marginRight: 10,
    width: 140,
    alignItems: "flex-start",
  },
  directoryItemTitle: {
    fontFamily: "Nunito_700Bold",
    fontSize: 13,
    color: colors.textPrimary,
    marginTop: 8,
    width: "100%",
  },
  directoryItemSubtitle: {
    fontFamily: "DMMono_500Medium",
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
});
