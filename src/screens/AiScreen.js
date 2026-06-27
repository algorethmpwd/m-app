import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { storage } from "../utils/storage";

export default function AiScreen({ transactions, budgets }) {
  const [apiKey, setApiKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [isKeySaved, setIsKeySaved] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState("chat"); // 'chat' or 'audit'

  // Chatbot State
  const [chatMessages, setChatMessages] = useState([
    {
      id: "welcome",
      role: "model",
      text: "Jambo! I am your Vault AI Financial Advisor. Ask me anything about your M-Pesa balances, savings, or spending habits.",
    },
  ]);
  const [userInput, setUserInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);

  // Health Audit State
  const [auditReport, setAuditReport] = useState("");
  const [runningAudit, setRunningAudit] = useState(false);

  const chatScrollRef = useRef();

  // Load API Key from storage
  useEffect(() => {
    const loadKey = async () => {
      const savedKey = await storage.getGeminiKey();
      if (savedKey) {
        setApiKey(savedKey);
        setKeyInput(savedKey);
        setIsKeySaved(true);
      }
    };
    loadKey();
  }, []);

  const handleSaveKey = async () => {
    if (!keyInput.trim()) {
      Alert.alert("Empty Key", "Please paste your Google Gemini API Key.");
      return;
    }
    await storage.saveGeminiKey(keyInput.trim());
    setApiKey(keyInput.trim());
    setIsKeySaved(true);
    Alert.alert("Success", "Gemini API key linked successfully.");
  };

  const handleResetKey = async () => {
    Alert.alert(
      "Unlink Key",
      "Are you sure you want to unlink your Gemini API Key?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unlink",
          style: "destructive",
          onPress: async () => {
            await storage.deleteGeminiKey();
            setApiKey("");
            setKeyInput("");
            setIsKeySaved(false);
            setChatMessages([
              {
                id: "welcome",
                role: "model",
                text: "Jambo! I am your Vault AI Financial Advisor. Ask me anything about your M-Pesa balances, savings, or spending habits.",
              },
            ]);
            setAuditReport("");
          },
        },
      ]
    );
  };

  // Helper: Format financial stats context for Gemini prompts
  const getFinancialContext = () => {
    const totalIncome = transactions
      .filter((t) => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpenses = transactions
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const totalBalance = totalIncome - totalExpenses;

    const ziidiBalance = transactions
      .filter((t) => t.isSavings || (t.title && t.title.toLowerCase().includes("ziidi")))
      .reduce((sum, t) => sum - t.amount, 0);

    const latestFulizaTx = transactions.find((t) => t.fulizaBalance !== undefined);
    const fulizaBalance = latestFulizaTx ? latestFulizaTx.fulizaBalance : 0;
    const netBalance = totalBalance + ziidiBalance - fulizaBalance;

    // Group expenses by category
    const categorySpend = transactions
      .filter((t) => t.amount < 0)
      .reduce((acc, t) => {
        const cat = t.icon || "swap-horizontal";
        acc[cat] = (acc[cat] || 0) + Math.abs(t.amount);
        return acc;
      }, {});

    // Recent 15 transactions summarized
    const recentTxSummary = transactions.slice(0, 15).map((t) => ({
      title: t.title,
      amount: t.amount,
      category: t.isSavings ? "Savings (Ziidi)" : (t.icon === "cart-outline" ? "Shopping/Merchant" : "P2P Send"),
      date: new Date(t.date).toLocaleDateString(),
    }));

    return {
      netBalance,
      mpesaCash: totalBalance,
      ziidiBalance,
      fulizaBalance,
      categorySpend,
      budgets,
      recentTxSummary,
    };
  };

  const handleSendChat = async () => {
    if (!userInput.trim() || sendingChat) return;

    const userMsg = {
      id: Date.now().toString(),
      role: "user",
      text: userInput.trim(),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setUserInput("");
    setSendingChat(true);

    // Auto-scroll chat window
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const context = getFinancialContext();
      
      const systemPrompt = `You are "Vault AI", a supportive, direct, and expert Kenyan financial advisor embedded inside an offline transaction monitoring app. 
You are advising a user regarding their personal finance.
Here is the user's current live balance and transactions status:
- Net Available Balance: Ksh ${context.netBalance}
- M-Pesa Cash: Ksh ${context.mpesaCash}
- Ziidi MMF (Savings): Ksh ${context.ziidiBalance}
- Outstanding Fuliza Debt: Ksh ${context.fulizaBalance}

Category Budgets (Monthly Caps): ${JSON.stringify(context.budgets)}
Total Spent by Category: ${JSON.stringify(context.categorySpend)}

Recent 15 Transactions:
${JSON.stringify(context.recentTxSummary)}

Instructions:
1. Act as a supportive but realistic financial coach. Keep your tone encouraging and professional.
2. Answer the user's question directly using the balance figures, transactions, and budgets provided.
3. Understand local features: "Fuliza" is an overdraft loan (negative balance), and "Ziidi" is Safaricom's investment/savings MMF product.
4. Keep answers relatively concise and format with bullet points where appropriate. Do not repeat instructions.

User's query: "${userMsg.text}"`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
          }),
        }
      );

      const json = await response.json();
      const modelText = json.candidates?.[0]?.content?.parts?.[0]?.text || "I apologize, I could not process your query at this time. Please check your API key and connection.";

      setChatMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "_model",
          role: "model",
          text: modelText,
        },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "_err",
          role: "model",
          text: "Connection failed. Please verify that your Gemini API key is correct and active.",
        },
      ]);
    } finally {
      setSendingChat(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleRunAudit = async () => {
    if (runningAudit) return;
    setRunningAudit(true);
    setAuditReport("");

    try {
      const context = getFinancialContext();
      const prompt = `You are "Vault AI Audit Engine", an expert financial auditor specializing in Kenyan mobile transactions.
Analyze the user's current transaction status:
- Net Available Balance: Ksh ${context.netBalance}
- M-Pesa Cash: Ksh ${context.mpesaCash}
- Ziidi MMF (Savings): Ksh ${context.ziidiBalance}
- Outstanding Fuliza Debt: Ksh ${context.fulizaBalance}

Category Budgets (Limits): ${JSON.stringify(context.budgets)}
Current Expenses by Category: ${JSON.stringify(context.categorySpend)}
Recent Transactions list: ${JSON.stringify(context.recentTxSummary)}

Generate a detailed, premium monthly Financial Health Audit report. Use standard formatting and sections:
1. **OVERALL HEALTH GRADE** (e.g. A to F) and short summary.
2. **BALANCE ANALYSIS** (How is their Cash vs Ziidi Savings vs Fuliza Debt balance ratio).
3. **BUDGET COMPLIANCE** (Highlight categories that are close to or over budget).
4. **RECOMMENDATIONS** (Provide exactly 3 actionable, localized tips to optimize their spending, grow savings, or clear debts).

Keep it professional, direct, and formatting clean.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      const json = await response.json();
      const resultText = json.candidates?.[0]?.content?.parts?.[0]?.text || "Could not generate report. Check connection.";
      setAuditReport(resultText);
    } catch (e) {
      setAuditReport("Failed to generate financial audit. Please verify your internet connection and linked API key.");
    } finally {
      setRunningAudit(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="sparkles" size={24} color={colors.accentPrimary} />
          <Text style={styles.screenHeader}>Vault AI Advisor</Text>
        </View>
        {isKeySaved && (
          <TouchableOpacity style={styles.unlinkButton} onPress={handleResetKey}>
            <Text style={styles.unlinkButtonText}>Unlink API</Text>
          </TouchableOpacity>
        )}
      </View>

      {!isKeySaved ? (
        <ScrollView contentContainerStyle={styles.keySetupContainer}>
          <View style={styles.infoCard}>
            <Ionicons name="shield-checkmark" size={36} color={colors.accentGold} />
            <Text style={styles.cardTitle}>Setup Gemini API</Text>
            <Text style={styles.cardText}>
              To enable local AI chat and financial insights audits, Vault connects directly to Google Gemini API using your personal API key. Your key is stored securely on this device and is never shared.
            </Text>
            <Text style={styles.instructionLink}>
              You can get a free developer key from Google AI Studio.
            </Text>
          </View>

          <Text style={styles.inputLabel}>Gemini API Key</Text>
          <TextInput
            style={styles.textInput}
            secureTextEntry={true}
            placeholder="Paste your AI Studio API key here"
            placeholderTextColor={colors.textMuted}
            value={keyInput}
            onChangeText={setKeyInput}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity style={styles.saveKeyButton} onPress={handleSaveKey}>
            <Text style={styles.saveKeyButtonText}>Link Gemini API</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Sub-tab selector */}
          <View style={styles.subTabContainer}>
            <TouchableOpacity
              style={[styles.subTabButton, activeSubTab === "chat" && styles.subTabButtonActive]}
              onPress={() => setActiveSubTab("chat")}
            >
              <Text style={[styles.subTabButtonText, activeSubTab === "chat" && styles.subTabButtonTextActive]}>
                AI Chat Advisor
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.subTabButton, activeSubTab === "audit" && styles.subTabButtonActive]}
              onPress={() => setActiveSubTab("audit")}
            >
              <Text style={[styles.subTabButtonText, activeSubTab === "audit" && styles.subTabButtonTextActive]}>
                Financial Audit
              </Text>
            </TouchableOpacity>
          </View>

          {activeSubTab === "chat" ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={{ flex: 1 }}
              keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
            >
              <ScrollView
                ref={chatScrollRef}
                style={styles.chatArea}
                contentContainerStyle={styles.chatContent}
                showsVerticalScrollIndicator={false}
              >
                {chatMessages.map((msg) => (
                  <View
                    key={msg.id}
                    style={[
                      styles.chatBubble,
                      msg.role === "user" ? styles.bubbleUser : styles.bubbleModel,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bubbleText,
                        msg.role === "user" ? styles.textUser : styles.textModel,
                      ]}
                    >
                      {msg.text}
                    </Text>
                  </View>
                ))}
                {sendingChat && (
                  <View style={[styles.chatBubble, styles.bubbleModel, styles.bubbleLoading]}>
                    <ActivityIndicator size="small" color={colors.accentPrimary} />
                  </View>
                )}
              </ScrollView>

              <View style={styles.chatInputBar}>
                <TextInput
                  style={styles.chatInput}
                  placeholder="Ask about your budget, Fuliza, or savings..."
                  placeholderTextColor={colors.textMuted}
                  value={userInput}
                  onChangeText={setUserInput}
                  onSubmitEditing={handleSendChat}
                />
                <TouchableOpacity
                  style={[styles.sendButton, !userInput.trim() && { opacity: 0.5 }]}
                  onPress={handleSendChat}
                  disabled={!userInput.trim() || sendingChat}
                >
                  <Ionicons name="send" size={18} color={colors.bgBase} />
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          ) : (
            <ScrollView contentContainerStyle={styles.auditContent} showsVerticalScrollIndicator={false}>
              <View style={styles.auditHeroCard}>
                <Ionicons name="analytics" size={48} color={colors.accentGold} />
                <Text style={styles.auditTitle}>Spend Health Audit</Text>
                <Text style={styles.auditSubtitle}>
                  Evaluate your current budgeting limits, analyze cash/overdraft ratios, and receive optimization coaching from Gemini.
                </Text>

                <TouchableOpacity
                  style={styles.runAuditButton}
                  onPress={handleRunAudit}
                  disabled={runningAudit}
                >
                  {runningAudit ? (
                    <ActivityIndicator size="small" color={colors.bgBase} />
                  ) : (
                    <Text style={styles.runAuditButtonText}>Run Audit Scan</Text>
                  )}
                </TouchableOpacity>
              </View>

              {auditReport ? (
                <View style={styles.reportCard}>
                  <Text style={styles.reportHeader}>Audit Report</Text>
                  <Text style={styles.reportText}>{auditReport}</Text>
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHairline,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  screenHeader: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 24,
    color: colors.accentGold,
    letterSpacing: 1,
    marginLeft: 8,
  },
  unlinkButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.statusExpense,
  },
  unlinkButtonText: {
    color: colors.statusExpense,
    fontFamily: "Nunito_600SemiBold",
    fontSize: 12,
  },
  keySetupContainer: {
    padding: 20,
    alignItems: "center",
  },
  infoCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: 20,
    alignItems: "center",
    marginBottom: 30,
    width: "100%",
  },
  cardTitle: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 20,
    color: colors.textPrimary,
    marginTop: 12,
    letterSpacing: 0.5,
  },
  cardText: {
    fontFamily: "Nunito_400Regular",
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
  },
  instructionLink: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 12,
    color: colors.accentPrimary,
    marginTop: 12,
  },
  inputLabel: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
    color: colors.textPrimary,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  textInput: {
    width: "100%",
    backgroundColor: colors.bgSunken,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    color: colors.textPrimary,
    fontFamily: "DMMono_500Medium",
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
  },
  saveKeyButton: {
    backgroundColor: colors.accentPrimary,
    width: "100%",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  saveKeyButtonText: {
    color: colors.bgBase,
    fontFamily: "Nunito_700Bold",
    fontSize: 14,
  },
  subTabContainer: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: colors.bgSunken,
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderHairline,
  },
  subTabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 6,
  },
  subTabButtonActive: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderHairline,
  },
  subTabButtonText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 13,
    color: colors.textMuted,
  },
  subTabButtonTextActive: {
    color: colors.accentGold,
  },
  chatArea: {
    flex: 1,
    paddingHorizontal: 16,
  },
  chatContent: {
    paddingVertical: 16,
  },
  chatBubble: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    maxWidth: "85%",
  },
  bubbleUser: {
    backgroundColor: colors.accentEmber,
    alignSelf: "flex-end",
    borderBottomRightRadius: 2,
  },
  bubbleModel: {
    backgroundColor: colors.bgElevated,
    alignSelf: "flex-start",
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: colors.borderHairline,
  },
  bubbleLoading: {
    alignItems: "center",
    justifyContent: "center",
    width: 50,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  textUser: {
    color: colors.textPrimary,
    fontFamily: "Nunito_600SemiBold",
  },
  textModel: {
    color: colors.textPrimary,
    fontFamily: "Nunito_400Regular",
  },
  chatInputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderHairline,
    backgroundColor: colors.bgBase,
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.bgSunken,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    color: colors.textPrimary,
    fontFamily: "Nunito_600SemiBold",
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: colors.accentPrimary,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  auditContent: {
    padding: 16,
    paddingBottom: 32,
  },
  auditHeroCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: 24,
    alignItems: "center",
    marginBottom: 20,
  },
  auditTitle: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 22,
    color: colors.textPrimary,
    marginTop: 12,
    letterSpacing: 0.5,
  },
  auditSubtitle: {
    fontFamily: "Nunito_400Regular",
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  runAuditButton: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
    marginTop: 18,
  },
  runAuditButtonText: {
    color: colors.bgBase,
    fontFamily: "Nunito_700Bold",
    fontSize: 14,
  },
  reportCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: 16,
  },
  reportHeader: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 18,
    color: colors.accentGold,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  reportText: {
    fontFamily: "Nunito_400Regular",
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 20,
  },
});
