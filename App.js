import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AppState,
  Platform,
  Alert,
  PermissionsAndroid,
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
import { classifyTransaction } from "./src/utils/classifier";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import LockScreen from "./src/screens/LockScreen";
import HomeScreen from "./src/screens/HomeScreen";
import InsightsScreen from "./src/screens/InsightsScreen";
import ReviewScreen from "./src/screens/ReviewScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

// Native SMS Module Bridge
import { NativeModules } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Clipboard from "expo-clipboard";
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

  const importBackgroundQueuedSyncs = async (currentTransactions) => {
    try {
      const queueUri = FileSystem.documentDirectory + "pending_background_syncs.json";
      const fileInfo = await FileSystem.getInfoAsync(queueUri);
      
      if (!fileInfo.exists) {
        return;
      }

      const fileContent = await FileSystem.readAsStringAsync(queueUri);
      const queuedMessages = JSON.parse(fileContent);

      if (!Array.isArray(queuedMessages) || queuedMessages.length === 0) {
        await FileSystem.deleteAsync(queueUri, { idempotent: true });
        return;
      }

      const parsedTxs = [];
      const reviewItems = [];
      const existingTxIds = new Set(currentTransactions.map((t) => t.id));

      queuedMessages.forEach((msg) => {
        const { confidence, parsed } = parseMpesaSms(msg.body, msg.id, msg.date, msg.address);

        if (confidence === "high" && parsed) {
          if (!existingTxIds.has(parsed.id)) {
            if (parsed.amount < 0) {
              const mlIcon = classifyTransaction(parsed.title, currentTransactions);
              if (mlIcon) {
                parsed.icon = mlIcon;
              }
            }
            parsedTxs.push(parsed);
            existingTxIds.add(parsed.id);
          }
        } else if (confidence === "low" || confidence === "none") {
          reviewItems.push({
            id: msg.id || "R_" + Date.now() + Math.random(),
            body: msg.body,
            date: msg.date || Date.now(),
            sender: msg.address,
          });
        }
      });

      let updatedTxs = [...currentTransactions];
      if (parsedTxs.length > 0) {
        updatedTxs = [...parsedTxs, ...currentTransactions];
        setTransactions(updatedTxs);
        await storage.saveTransactions(updatedTxs);
      }

      if (reviewItems.length > 0) {
        const updatedReview = [...reviewItems, ...reviewQueue];
        setReviewQueue(updatedReview);
        await storage.saveReviewQueue(updatedReview);
      }

      await FileSystem.deleteAsync(queueUri, { idempotent: true });

      if (parsedTxs.length > 0) {
        Alert.alert(
          "Auto-Sync Completed",
          `Auto-imported ${parsedTxs.length} transaction(s) received in the background.`
        );
      }
    } catch (error) {
      console.error("Error importing background syncs:", error);
    }
  };

  const checkClipboardForReceipts = async (currentTransactions) => {
    try {
      const hasString = await Clipboard.hasStringAsync();
      if (!hasString) return;

      const clipboardContent = await Clipboard.getStringAsync();
      if (!clipboardContent) return;

      const contentTrimmed = clipboardContent.trim();
      const bodyLower = contentTrimmed.toLowerCase();
      
      const isMpesa = bodyLower.includes("mpesa") || bodyLower.includes("m-pesa");
      const isBank = bodyLower.includes("equity") || bodyLower.includes("kcb alert") || bodyLower.includes("co-op bank") || bodyLower.includes("debited") || bodyLower.includes("credited");

      if (isMpesa || isBank) {
        const { confidence, parsed } = parseMpesaSms(contentTrimmed, "C_" + Date.now(), Date.now());
        
        if (parsed) {
          const exists = currentTransactions.some((t) => t.id === parsed.id);
          if (exists) return;

          Alert.alert(
            "Transaction Detected in Clipboard",
            `We found a statement for Ksh ${Math.abs(parsed.amount)} (${parsed.title}) in your clipboard. Import it?`,
            [
              { text: "Dismiss" },
              {
                text: "Import",
                onPress: async () => {
                  if (parsed.amount < 0) {
                    const mlIcon = classifyTransaction(parsed.title, currentTransactions);
                    if (mlIcon) {
                      parsed.icon = mlIcon;
                    }
                  }
                  const updatedTxs = [parsed, ...currentTransactions];
                  setTransactions(updatedTxs);
                  await storage.saveTransactions(updatedTxs);
                  await Clipboard.setStringAsync("");
                  Alert.alert("Success", "Imported transaction successfully.");
                }
              }
            ]
          );
        }
      }
    } catch (error) {
      console.log("Error checking clipboard:", error);
    }
  };

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

          const currentTxs = savedTx || [];
          if (savedTx) setTransactions(savedTx);
          if (savedBudgets) setBudgets(savedBudgets);
          if (savedReview) setReviewQueue(savedReview);
          if (savedPin) setPin(savedPin);

          if (savedSettings) {
            setIntakeMethod(savedSettings.intakeMethod || "paste");
            setReminderTime(savedSettings.reminderTime || { hour: 20, minute: 0 });
          }

          await importBackgroundQueuedSyncs(currentTxs);
          await checkClipboardForReceipts(currentTxs);
        }
      } catch (err) {
        console.error("Failed to load local app database:", err);
      }
    };
    loadAppData();
  }, []);

  // 2. Enforce lock on resume
  useEffect(() => {
    const handleAppStateChange = async (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // Enforce App Lock PIN overlay
        if (pin) {
          setIsLocked(true);
        }

        const currentTxList = await storage.getTransactions() || [];
        await importBackgroundQueuedSyncs(currentTxList);
        await checkClipboardForReceipts(currentTxList);
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

    try {
      const hasRead = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
      const hasReceive = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);

      if (!hasRead || !hasReceive) {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.READ_SMS,
          PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
        ]);
        
        const readGranted = results[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED;
        const receiveGranted = results[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED;

        if (!readGranted) {
          Alert.alert("Permission Denied", "SMS synchronization and real-time alerts require SMS permissions.");
          return;
        }
      }
    } catch (err) {
      Alert.alert("Permission Error", "Failed to check or request SMS permission: " + err.message);
      return;
    }

    setSyncing(true);
    try {
      const messages = await SmsModule.getSmsList(2000); // Fetch recent 2000
      const parsedTxs = [];
      const reviewItems = [];

      messages.forEach((msg) => {
        const sender = msg.address ? msg.address.toUpperCase() : "";
        const isMpesa = sender.includes("MPESA") || sender.includes("M-PESA");
        const isBank = sender.includes("EQUITY") || sender.includes("EQUITEL") || sender.includes("KCB") || sender.includes("COOP") || sender.includes("NCBA") || sender.includes("ABSA");

        if (isMpesa || isBank) {
          const { confidence, parsed } = parseMpesaSms(msg.body, msg.id, msg.date, msg.address);
          
          if (confidence === "high" && parsed) {
            if (parsed.amount < 0) {
              const mlIcon = classifyTransaction(parsed.title, transactions);
              if (mlIcon) {
                parsed.icon = mlIcon;
              }
            }
            parsedTxs.push(parsed);
          } else if (confidence === "low" || confidence === "none") {
            reviewItems.push({
              id: msg.id || "R_" + Date.now() + Math.random(),
              body: msg.body,
              date: msg.date || Date.now(),
              sender: msg.address,
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