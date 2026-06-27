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

export default function AiScreen({
  transactions,
  budgets,
  reviewQueue = [],
  onUpdateTransactions,
  onUpdateReviewQueue,
  onUpdateBudgets,
}) {
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

  // AI Agent Action States
  const [runningAutoReview, setRunningAutoReview] = useState(false);
  const [runningRecategorize, setRunningRecategorize] = useState(false);

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

    // Latest actual balances
    const latestMpesaTx = transactions.find((t) => t.mpesaBalance !== undefined);
    const latestZiidiTx = transactions.find((t) => t.ziidiBalance !== undefined);
    const latestFulizaTx = transactions.find((t) => t.fulizaBalance !== undefined);

    const mpesaCashBalance = latestMpesaTx ? latestMpesaTx.mpesaBalance : (totalIncome - totalExpenses);
    const ziidiBalance = latestZiidiTx ? latestZiidiTx.ziidiBalance : 0;
    const fulizaBalance = latestFulizaTx ? latestFulizaTx.fulizaBalance : 0;
    const netBalance = mpesaCashBalance + ziidiBalance - fulizaBalance;

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
      mpesaCash: mpesaCashBalance,
      ziidiBalance,
      fulizaBalance,
      categorySpend,
      budgets,
      recentTxSummary,
    };
  };

  const cleanJsonResponse = (rawText) => {
    let clean = rawText.trim();
    // Remove markdown code block wrapping if present
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```[a-z]*\n/i, "").replace(/\n```$/i, "").trim();
    }
    return clean;
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
5. TOOL CALLING ACTIONS: If the user explicitly asks you to set a category budget or change the category of a transaction, you MUST append a JSON action block at the very end of your response inside |ACTION| brackets. Supported formats:
- |ACTION|{"action":"recategorize","title":"NameOfMerchant","category":"icon-name"}|ACTION|
- |ACTION|{"action":"set_budget","category":"icon-name","amount":number}|ACTION|

Available icon-names: 'cart-outline', 'home-outline', 'logo-youtube', 'restaurant-outline', 'car-outline', 'gift-outline', 'send', 'wallet', 'trending-up-outline', 'swap-horizontal'.

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
      let modelText = json.candidates?.[0]?.content?.parts?.[0]?.text || "I apologize, I could not process your query at this time. Please check your API key and connection.";

      // Check for |ACTION| block in model response
      const actionRegex = /\|ACTION\|([\s\S]+?)\|ACTION\|/;
      const actionMatch = modelText.match(actionRegex);
      
      if (actionMatch) {
        try {
          const actionData = JSON.parse(actionMatch[1]);
          if (actionData.action === "recategorize") {
            const updated = transactions.map((t) => {
              if (t.title && t.title.toLowerCase().includes(actionData.title.toLowerCase())) {
                return { ...t, icon: actionData.category };
              }
              return t;
            });
            onUpdateTransactions(updated);
            Alert.alert("AI Action Executed", `Auto-corrected all transactions matching "${actionData.title}" to category "${actionData.category}".`);
          } else if (actionData.action === "set_budget") {
            const updatedBudgets = { ...budgets, [actionData.category]: actionData.amount };
            onUpdateBudgets(updatedBudgets);
            Alert.alert("AI Action Executed", `Successfully updated monthly limit for category "${actionData.category}" to Ksh ${actionData.amount}.`);
          }
          // Strip the action block from the visible chat bubble
          modelText = modelText.replace(actionRegex, "").trim();
        } catch (actionErr) {
          console.error("AI Action parse failed:", actionErr);
        }
      }

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

  // AI Agent Action: Resolve Review Queue
  const handleAutoReview = async () => {
    if (reviewQueue.length === 0) {
      Alert.alert("Empty Queue", "No transactions in the review queue to resolve.");
      return;
    }
    setRunningAutoReview(true);

    try {
      const messagesToParse = reviewQueue.map((item) => ({
        id: item.id,
        body: item.body,
        date: item.date,
        sender: item.sender || "",
      }));

      const prompt = `You are a financial statement parsing engine. Read the following unparsed SMS messages and extract clean transaction details:
${JSON.stringify(messagesToParse)}

Parse each message and return a JSON array of objects. Each object MUST have this structure:
{
  "id": "A unique string ID matching the SMS ID provided",
  "title": "A cleaned counterparty name (max 25 chars, e.g. 'James Maina')",
  "amount": "A float number. Positive for credits/income, negative for debits/expenses",
  "icon": "One of these matching the transaction category: 'cart-outline', 'home-outline', 'logo-youtube', 'restaurant-outline', 'car-outline', 'gift-outline', 'send', 'wallet', 'trending-up-outline', 'swap-horizontal'",
  "date": "The timestamp provided in the SMS object (integer)",
  "isSavings": "true if it is a savings/Ziidi transaction, false otherwise",
  "mpesaBalance": "float if an M-Pesa balance is explicitly printed in the message, otherwise null",
  "ziidiBalance": "float if a Ziidi balance is explicitly printed, otherwise null",
  "fulizaBalance": "float if a Fuliza balance is explicitly printed, otherwise null"
}

IMPORTANT instructions:
1. Return ONLY a valid JSON array. Do not include markdown code block syntax (like \`\`\`json) or any explanations. Return raw string starting with [ and ending with ].
2. If a message cannot be parsed, omit it from the array.`;

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
      const cleaned = cleanJsonResponse(rawText);
      const parsedItems = JSON.parse(cleaned);

      if (Array.isArray(parsedItems) && parsedItems.length > 0) {
        // Filter out duplicate IDs
        const existingIds = new Set(transactions.map((t) => t.id));
        const newTxs = parsedItems.filter((item) => !existingIds.has(item.id));

        // Merge into transactions
        const mergedTxs = [...newTxs, ...transactions];
        onUpdateTransactions(mergedTxs);

        // Remove from review queue
        const parsedIds = new Set(parsedItems.map((item) => item.id));
        const remainingQueue = reviewQueue.filter((item) => !parsedIds.has(item.id));
        onUpdateReviewQueue(remainingQueue);

        Alert.alert(
          "AI Review Completed",
          `AI successfully parsed and auto-resolved ${newTxs.length} transaction(s) from your review queue.`
        );
      } else {
        Alert.alert("AI Review", "Gemini scanned the queue but could not extract any structured transactions.");
      }
    } catch (e) {
      Alert.alert("Failed", "AI Auto-Review failed: " + e.message);
    } finally {
      setRunningAutoReview(false);
    }
  };

  // AI Agent Action: Auto-Categorize Transactions
  const handleAutoCategorize = async () => {
    if (transactions.length === 0) {
      Alert.alert("Empty", "No transactions found to re-categorize.");
      return;
    }
    setRunningRecategorize(true);

    try {
      const txList = transactions.map((t) => ({
        id: t.id,
        title: t.title,
        amount: t.amount,
        icon: t.icon || "swap-horizontal",
      }));

      const prompt = `Review the following transaction names and their current categories (icons):
${JSON.stringify(txList)}

Your goal is to identify transactions that are generic ('swap-horizontal') or obviously miscategorized, and recommend the correct icon.
Available icons are:
- 'cart-outline' (Shopping, Supermarkets, general purchases, paybill, buy goods)
- 'home-outline' (Rent, Electricity, KPLC, Water bills)
- 'logo-youtube' (Subscriptions, Netflix, Spotify)
- 'restaurant-outline' (Food, Dining, restaurants, coffee)
- 'car-outline' (Transport, Uber, Bolt, Fuel, petrol)
- 'gift-outline' (Gifts, donations)
- 'send' (P2P transfers to individuals, sent to)
- 'wallet' (Cash withdrawals)
- 'trending-up-outline' (Savings, Ziidi MMF, investments)
- 'swap-horizontal' (Other, fallback)

Analyze the counterparties. If you recommend a correction, add it to your response.
Return ONLY a valid JSON object mapping transaction ID to new icon name, for example:
{
  "TX_123": "cart-outline",
  "TX_456": "home-outline"
}

Do not include markdown code block syntax (like \`\`\`json) or any explanations. Return raw string starting with { and ending with }.`;

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
      const cleaned = cleanJsonResponse(rawText);
      const updates = JSON.parse(cleaned);

      if (updates && typeof updates === "object" && Object.keys(updates).length > 0) {
        let updateCount = 0;
        const updatedTransactions = transactions.map((t) => {
          if (updates[t.id] && updates[t.id] !== t.icon) {
            updateCount++;
            return { ...t, icon: updates[t.id] };
          }
          return t;
        });

        if (updateCount > 0) {
          onUpdateTransactions(updatedTransactions);
          Alert.alert(
            "Recategorization Completed",
            `AI scanned your records and auto-corrected categories for ${updateCount} transactions.`
          );
        } else {
          Alert.alert("AI Categorizer", "All transactions seem to have appropriate categories. No changes needed!");
        }
      } else {
        Alert.alert("AI Categorizer", "No modifications recommended by the AI categorizer.");
      }
    } catch (e) {
      Alert.alert("Failed", "AI Recategorizer failed: " + e.message);
    } finally {
      setRunningRecategorize(false);
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
                AI Agent Actions
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
              
              {/* AI Agent Action: Resolve Review Queue */}
              <View style={styles.agentCard}>
                <View style={styles.agentHeader}>
                  <Ionicons name="construct-outline" size={24} color={colors.statusPending} />
                  <Text style={styles.agentTitle}>AI Queue Assistant</Text>
                </View>
                <Text style={styles.agentText}>
                  Parse un-resolved transaction statements sitting in your Review tab. Gemini will read the raw text and import them cleanly.
                </Text>
                <View style={styles.agentStatusRow}>
                  <Text style={styles.agentStatusText}>
                    Queued items: {reviewQueue.length}
                  </Text>
                  <TouchableOpacity
                    style={[styles.agentButton, reviewQueue.length === 0 && styles.disabledButton]}
                    onPress={handleAutoReview}
                    disabled={reviewQueue.length === 0 || runningAutoReview}
                  >
                    {runningAutoReview ? (
                      <ActivityIndicator size="small" color={colors.bgBase} />
                    ) : (
                      <Text style={styles.agentButtonText}>Resolve with AI</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* AI Agent Action: Recategorize Transactions */}
              <View style={styles.agentCard}>
                <View style={styles.agentHeader}>
                  <Ionicons name="folder-open-outline" size={24} color={colors.accentGold} />
                  <Text style={styles.agentTitle}>AI Smart Recategorizer</Text>
                </View>
                <Text style={styles.agentText}>
                  Scan all transactions, map counterparties to appropriate categories, and auto-correct generic classification tags.
                </Text>
                <View style={styles.agentStatusRow}>
                  <Text style={styles.agentStatusText}>
                    Transactions logged: {transactions.length}
                  </Text>
                  <TouchableOpacity
                    style={[styles.agentButton, transactions.length === 0 && styles.disabledButton]}
                    onPress={handleAutoCategorize}
                    disabled={transactions.length === 0 || runningRecategorize}
                  >
                    {runningRecategorize ? (
                      <ActivityIndicator size="small" color={colors.bgBase} />
                    ) : (
                      <Text style={styles.agentButtonText}>Recategorize AI</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Spend Health Audit */}
              <View style={styles.auditHeroCard}>
                <Ionicons name="analytics" size={32} color={colors.accentPrimary} />
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
  agentCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: 16,
    marginBottom: 16,
  },
  agentHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  agentTitle: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 16,
    color: colors.textPrimary,
    marginLeft: 8,
    letterSpacing: 0.5,
  },
  agentText: {
    fontFamily: "Nunito_400Regular",
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
    marginBottom: 12,
  },
  agentStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  agentStatusText: {
    fontFamily: "DMMono_500Medium",
    fontSize: 11,
    color: colors.textMuted,
  },
  agentButton: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  agentButtonText: {
    color: colors.bgBase,
    fontFamily: "Nunito_700Bold",
    fontSize: 12,
  },
  disabledButton: {
    opacity: 0.4,
  },
  auditHeroCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
    marginTop: 8,
  },
  auditTitle: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 20,
    color: colors.textPrimary,
    marginTop: 8,
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
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 14,
  },
  runAuditButtonText: {
    color: colors.bgBase,
    fontFamily: "Nunito_700Bold",
    fontSize: 13,
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
