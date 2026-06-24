import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AppState,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";

// Fonts
import { useFonts } from "expo-font";
import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold } from "@expo-google-fonts/nunito";
import { DMMono_500Medium } from "@expo-google-fonts/dm-mono";

// Screens & Utilities
import { colors } from "./src/theme/colors";
import { storage } from "./src/utils/storage";
import { parseMpesaSms } from "./src/utils/parser";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import LockScreen from "./src/screens/LockScreen";
import HomeScreen from "./src/screens/HomeScreen";
import InsightsScreen from "./src/screens/InsightsScreen";
import ReviewScreen from "./src/screens/ReviewScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

// Native SMS Module Bridge
import { NativeModules } from "react-native";
const { SmsModule } = NativeModules;

export default function App() {
  const [fontsLoaded] = useFonts({
    BebasNeue_400Regular,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    DMMono_500Medium,
  });

  // State Management
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [activeTab, setActiveTab] = useState("Home");
  const [syncing, setSyncing] = useState(false);

  // App Data State
  const [transactions, setTransactions] = useState([]);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [intakeMethod, setIntakeMethod] = useState("paste"); // 'paste' or 'sms'
  const [reminderTime, setReminderTime] = useState({ hour: 20, minute: 0 });
  const [pin, setPin] = useState(null);

  // AppState monitoring for background lock
  const appState = useRef(AppState.currentState);

  // 1. Initial Data Loading
  useEffect(() => {
    const loadAppData = async () => {
      try {
        const onboarded = await storage.getOnboardingComplete();
        setOnboardingComplete(onboarded);

        if (onboarded) {
          const savedTx = await storage.getTransactions();
          const savedBudgets = await storage.getBudgets();
          const savedReview = await storage.getReviewQueue();
          const savedSettings = await storage.getSettings();
          const savedPin = await storage.getPin();

          if (savedTx) setTransactions(savedTx);
          if (savedBudgets) setBudgets(savedBudgets);
          if (savedReview) setReviewQueue(savedReview);
          if (savedPin) setPin(savedPin);

          if (savedSettings) {
            setIntakeMethod(savedSettings.intakeMethod || "paste");
            setReminderTime(savedSettings.reminderTime || { hour: 20, minute: 0 });
          }
        }
      } catch (err) {
        console.error("Failed to load local app database:", err);
      }
    };
    loadAppData();
  }, []);

  // 2. Enforce lock on resume
  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // Enforce App Lock PIN overlay
        if (pin) {
          setIsLocked(true);
        }
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [pin]);

  // Onboarding completion wizard submission
  const handleOnboardingComplete = async (data) => {
    try {
      setPin(data.pin);
      setIntakeMethod(data.intakeMethod);

      await storage.savePin(data.pin);
      await storage.saveSettings({
        intakeMethod: data.intakeMethod,
        reminderTime: { hour: 20, minute: 0 },
      });
      await storage.setOnboardingComplete(true);
      
      setOnboardingComplete(true);
      setIsLocked(false);
    } catch (e) {
      Alert.alert("Error Saving Settings", "Could not write onboarding setup to memory.");
    }
  };

  // Sync SMS (Android only, requires sideload build)
  const handleSyncSMS = async () => {
    if (Platform.OS !== "android") {
      Alert.alert("iOS Not Supported", "SMS auto-read sync is only supported on Android devices.");
      return;
    }
    if (!SmsModule) {
      Alert.alert(
        "Power Build Required",
        "SMS inbox scan requires custom native module compilation. Please run 'npm run android' to boot."
      );
      return;
    }

    setSyncing(true);
    try {
      const messages = await SmsModule.getSmsList(50); // Fetch recent 50
      const parsedTxs = [];
      const reviewItems = [];

      messages.forEach((msg) => {
        const sender = msg.address ? msg.address.toUpperCase() : "";
        if (sender.includes("MPESA") || sender.includes("M-PESA")) {
          const { confidence, parsed } = parseMpesaSms(msg.body, msg.id, msg.date);
          
          if (confidence === "high" && parsed) {
            parsedTxs.push(parsed);
          } else if (confidence === "low" || confidence === "none") {
            reviewItems.push({
              id: msg.id || "R_" + Date.now() + Math.random(),
              body: msg.body,
              date: msg.date || Date.now(),
            });
          }
        }
      });

      // Filter out duplicate transactions
      const existingTxIds = new Set(transactions.map((t) => t.id));
      const newTxs = parsedTxs.filter((t) => !existingTxIds.has(t.id));

      // Filter out duplicate review SMS
      const existingReviewIds = new Set(reviewQueue.map((r) => r.id));
      const newReviews = reviewItems.filter((r) => !existingReviewIds.has(r.id));

      if (newTxs.length > 0 || newReviews.length > 0) {
        const updatedTxs = [...newTxs, ...transactions];
        const updatedReview = [...newReviews, ...reviewQueue];
        
        setTransactions(updatedTxs);
        setReviewQueue(updatedReview);
        
        await storage.saveTransactions(updatedTxs);
        await storage.saveReviewQueue(updatedReview);

        Alert.alert(
          "Sync Complete",
          `Imported ${newTxs.length} new transactions. Added ${newReviews.length} items to Review Queue.`
        );
      } else {
        Alert.alert("Sync Complete", "All transactions in your SMS logs are already imported!");
      }
    } catch (e) {
      Alert.alert("Sync Failed", e.message);
    } finally {
      setSyncing(false);
    }
  };

  // Transaction modifiers
  const handleAddTransaction = async (tx) => {
    const updated = [tx, ...transactions];
    setTransactions(updated);
    await storage.saveTransactions(updated);
  };

  const handleDeleteTransaction = async (id) => {
    const updated = transactions.filter((t) => t.id !== id);
    setTransactions(updated);
    await storage.saveTransactions(updated);
  };

  // Review Queue modifiers
  const handleAddReviewItem = async (item) => {
    const updated = [item, ...reviewQueue];
    setReviewQueue(updated);
    await storage.saveReviewQueue(updated);
  };

  const handleResolveReviewItem = async (smsId, resolvedTx) => {
    const updatedQueue = reviewQueue.filter((item) => item.id !== smsId);
    setReviewQueue(updatedQueue);
    await storage.saveReviewQueue(updatedQueue);
    
    await handleAddTransaction(resolvedTx);
  };

  const handleDiscardReviewItem = async (smsId) => {
    const updatedQueue = reviewQueue.filter((item) => item.id !== smsId);
    setReviewQueue(updatedQueue);
    await storage.saveReviewQueue(updatedQueue);
  };

  // Settings modifiers
  const handleUpdateIntakeMethod = async (method) => {
    setIntakeMethod(method);
    await storage.saveSettings({
      intakeMethod: method,
      reminderTime,
    });
  };

  const handleUpdateBudgets = async (updatedBudgets) => {
    setBudgets(updatedBudgets);
    await storage.saveBudgets(updatedBudgets);
  };

  const handleUpdateReminderTime = async (time) => {
    setReminderTime(time);
    await storage.saveSettings({
      intakeMethod,
      reminderTime: time,
    });
  };

  const handleTogglePinLock = async (newPinCode) => {
    if (newPinCode) {
      setPin(newPinCode);
      await storage.savePin(newPinCode);
    } else {
      setPin(null);
      await storage.deletePin();
    }
  };

  // Restore imported data bundle
  const handleRestoreData = async (data) => {
    setTransactions(data.transactions || []);
    setBudgets(data.budgets || {});
    if (data.settings) {
      setIntakeMethod(data.settings.intakeMethod || "paste");
      setReminderTime(data.settings.reminderTime || { hour: 20, minute: 0 });
    }
    
    await storage.saveTransactions(data.transactions || []);
    await storage.saveBudgets(data.budgets || {});
    await storage.saveSettings(data.settings || {
      intakeMethod: "paste",
      reminderTime: { hour: 20, minute: 0 },
    });
  };

  // Reset application completely
  const handleResetApp = async () => {
    await storage.clearAll();
    
    // Reset local states
    setTransactions([]);
    setReviewQueue([]);
    setBudgets({});
    setIntakeMethod("paste");
    setReminderTime({ hour: 20, minute: 0 });
    setPin(null);
    setOnboardingComplete(false);
    setIsLocked(true);
    setActiveTab("Home");
  };

  // Custom Font Loading fallback
  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Calibrating Vault...</Text>
      </View>
    );
  }

  // 1. Onboarding Gate
  if (!onboardingComplete) {
    return <OnboardingScreen onComplete={handleOnboardingComplete} />;
  }

  // 2. Lock Screen overlay
  if (isLocked && pin) {
    return <LockScreen correctPin={pin} onUnlock={() => setIsLocked(false)} />;
  }

  return (
    <SafeAreaProvider style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.screenBody}>
        {activeTab === "Home" && (
          <HomeScreen
            transactions={transactions}
            reviewQueue={reviewQueue}
            intakeMethod={intakeMethod}
            syncing={syncing}
            onSync={handleSyncSMS}
            onAddTransaction={handleAddTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onAddReviewItem={handleAddReviewItem}
            onNavigateToTab={setActiveTab}
          />
        )}
        {activeTab === "Insights" && (
          <InsightsScreen
            transactions={transactions}
            budgets={budgets}
            onDeleteTransaction={handleDeleteTransaction}
          />
        )}
        {activeTab === "Review" && (
          <ReviewScreen
            reviewQueue={reviewQueue}
            onResolveItem={handleResolveReviewItem}
            onDiscardItem={handleDiscardReviewItem}
          />
        )}
        {activeTab === "Settings" && (
          <SettingsScreen
            transactions={transactions}
            budgets={budgets}
            intakeMethod={intakeMethod}
            reminderTime={reminderTime}
            pinEnabled={!!pin}
            onUpdateIntakeMethod={handleUpdateIntakeMethod}
            onUpdateBudgets={handleUpdateBudgets}
            onUpdateReminderTime={handleUpdateReminderTime}
            onTogglePinLock={handleTogglePinLock}
            onRestoreData={handleRestoreData}
            onResetApp={handleResetApp}
          />
        )}
      </View>

      {/* Custom Tab Bar (4 Tabs) */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab("Home")}
        >
          <Ionicons
            name={activeTab === "Home" ? "home" : "home-outline"}
            size={22}
            color={activeTab === "Home" ? colors.accentPrimary : colors.textMuted}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: activeTab === "Home" ? colors.accentPrimary : colors.textMuted },
            ]}
          >
            Home
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab("Insights")}
        >
          <Ionicons
            name={activeTab === "Insights" ? "analytics" : "analytics-outline"}
            size={22}
            color={activeTab === "Insights" ? colors.accentPrimary : colors.textMuted}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: activeTab === "Insights" ? colors.accentPrimary : colors.textMuted },
            ]}
          >
            Insights
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab("Review")}
        >
          <View>
            <Ionicons
              name={activeTab === "Review" ? "shield" : "shield-outline"}
              size={22}
              color={activeTab === "Review" ? colors.accentPrimary : colors.textMuted}
            />
            {/* Red dot badge (no numbers, to avoid chore pressure) */}
            {reviewQueue.length > 0 && (
              <View style={styles.redBadgeDot} />
            )}
          </View>
          <Text
            style={[
              styles.tabLabel,
              { color: activeTab === "Review" ? colors.accentPrimary : colors.textMuted },
            ]}
          >
            Review
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab("Settings")}
        >
          <Ionicons
            name={activeTab === "Settings" ? "settings" : "settings-outline"}
            size={22}
            color={activeTab === "Settings" ? colors.accentPrimary : colors.textMuted}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: activeTab === "Settings" ? colors.accentPrimary : colors.textMuted },
            ]}
          >
            Settings
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bgBase,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: colors.textMuted,
    fontFamily: "Nunito_400Regular",
    fontSize: 15,
  },
  screenBody: {
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    height: 60,
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.borderHairline,
    justifyContent: "space-around",
    alignItems: "center",
    paddingBottom: Platform.OS === "ios" ? 15 : 0,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  tabLabel: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 10,
    marginTop: 4,
  },
  redBadgeDot: {
    position: "absolute",
    right: -4,
    top: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.statusExpense, // red/clay warning dot
  },
});