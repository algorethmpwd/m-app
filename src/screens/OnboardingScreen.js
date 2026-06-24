import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

export default function OnboardingScreen({ onComplete }) {
  const [step, setStep] = useState(1);
  const [intakeMethod, setIntakeMethod] = useState("paste"); // 'paste' or 'sms'
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => s - 1);

  const handleFinishOnboarding = () => {
    if (pin.length !== 4) {
      Alert.alert("PIN Required", "Please enter a 4-digit App Lock PIN.");
      return;
    }
    if (pin !== confirmPin) {
      Alert.alert("PIN Mismatch", "The PINs you entered do not match.");
      return;
    }

    onComplete({
      intakeMethod,
      pin,
    });
  };

  const handleKeyPress = (num) => {
    if (step === 4) {
      // PIN Setup Step
      const currentPin = pin.length < 4 ? pin : confirmPin;
      const isConfirming = pin.length === 4;

      if (num === "delete") {
        if (isConfirming) {
          setConfirmPin((prev) => prev.slice(0, -1));
        } else {
          setPin((prev) => prev.slice(0, -1));
        }
      } else {
        if (isConfirming) {
          if (confirmPin.length < 4) setConfirmPin((prev) => prev + num);
        } else {
          if (pin.length < 4) setPin((prev) => prev + num);
        }
      }
    }
  };

  const renderKeypad = () => {
    const keys = [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
      ["", "0", "⌫"],
    ];

    return (
      <View style={styles.keypad}>
        {keys.map((row, i) => (
          <View key={i} style={styles.keypadRow}>
            {row.map((key, j) => {
              if (key === "") return <View key={j} style={styles.keypadButton} />;
              return (
                <TouchableOpacity
                  key={j}
                  style={styles.keypadButton}
                  onPress={() => handleKeyPress(key === "⌫" ? "delete" : key)}
                >
                  <Text style={styles.keypadText}>
                    {key}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top indicator bar */}
      <View style={styles.indicatorContainer}>
        {[1, 2, 3, 4].map((s) => (
          <View
            key={s}
            style={[
              styles.indicatorDot,
              s <= step && styles.indicatorDotActive,
            ]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.welcomeTitle}>VAULT</Text>
            <View style={styles.swahiliContainer}>
              <Text style={styles.swahiliQuote}>"Hela zako, zikijieleza zenyewe."</Text>
              <Text style={styles.englishSub}>Your money, explaining itself.</Text>
            </View>
            <Text style={styles.bodyDescription}>
              The expense tracker that fills itself in. Vault automatically parses what M-Pesa already notified you, saving you from tedious manual tracking.
            </Text>
            <View style={styles.spacer} />
            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.primaryButton, { marginLeft: 0 }]} onPress={nextStep}>
                <Text style={styles.primaryButtonText}>Get Started</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContainer}>
            <View style={styles.stepHeader}>
              <Ionicons name="lock-closed-outline" size={32} color={colors.accentPrimary} />
              <Text style={styles.stepTitle}>Privacy Promise</Text>
            </View>
            <Text style={styles.bodyDescription}>
              Vault runs 100% locally on your phone.
            </Text>
            <View style={styles.bulletList}>
              <View style={styles.bulletRow}>
                <Ionicons name="shield-checkmark" size={18} color={colors.statusIncome} />
                <Text style={styles.bulletText}>No financial data ever leaves your device.</Text>
              </View>
              <View style={styles.bulletRow}>
                <Ionicons name="shield-checkmark" size={18} color={colors.statusIncome} />
                <Text style={styles.bulletText}>Vault has no servers and no analytics tracking.</Text>
              </View>
              <View style={styles.bulletRow}>
                <Ionicons name="shield-checkmark" size={18} color={colors.statusIncome} />
                <Text style={styles.bulletText}>Your SMS history is only scanned locally for transactions.</Text>
              </View>
            </View>
            <View style={styles.spacer} />
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={prevStep}>
                <Text style={styles.secondaryButtonText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={nextStep}>
                <Text style={styles.primaryButtonText}>Accept & Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepContainer}>
            <View style={styles.stepHeader}>
              <Ionicons name="options-outline" size={32} color={colors.accentPrimary} />
              <Text style={styles.stepTitle}>Transaction Intake</Text>
            </View>
            <Text style={styles.bodyDescription}>
              Choose how Vault will receive your financial records on this device:
            </Text>

            {/* Paste Method */}
            <TouchableOpacity
              style={[
                styles.choiceCard,
                intakeMethod === "paste" && styles.choiceCardActive,
              ]}
              onPress={() => setIntakeMethod("paste")}
            >
              <View style={styles.choiceHeader}>
                <Ionicons name="document-text-outline" size={24} color={intakeMethod === "paste" ? colors.accentPrimary : colors.textMuted} />
                <Text style={[styles.choiceTitle, intakeMethod === "paste" && styles.choiceTextActive]}>
                  Forward / Paste Messages
                </Text>
              </View>
              <Text style={styles.choiceDesc}>
                Paste your M-Pesa SMS alerts manually or configure message forwarding. Recommended & Play Store safe.
              </Text>
              <View style={styles.badgeSafe}>
                <Text style={styles.badgeSafeText}>PLAY STORE COMPLIANT</Text>
              </View>
            </TouchableOpacity>

            {/* Read SMS Method */}
            <TouchableOpacity
              style={[
                styles.choiceCard,
                intakeMethod === "sms" && styles.choiceCardActive,
                Platform.OS !== "android" && styles.choiceCardDisabled,
              ]}
              disabled={Platform.OS !== "android"}
              onPress={() => setIntakeMethod("sms")}
            >
              <View style={styles.choiceHeader}>
                <Ionicons name="chatbubbles-outline" size={24} color={intakeMethod === "sms" ? colors.accentPrimary : colors.textMuted} />
                <Text style={[styles.choiceTitle, intakeMethod === "sms" && styles.choiceTextActive]}>
                  Auto-Read SMS Inbox
                </Text>
              </View>
              <Text style={styles.choiceDesc}>
                Vault automatically scans your incoming SMS logs to import M-Pesa receipts. (Android Power User build).
              </Text>
              {Platform.OS !== "android" ? (
                <View style={styles.badgeDisabled}>
                  <Text style={styles.badgeDisabledText}>ANDROID ONLY</Text>
                </View>
              ) : (
                <View style={styles.badgeWarning}>
                  <Text style={styles.badgeWarningText}>REQUIRES EXTENDED PERMISSION</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.spacer} />
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={prevStep}>
                <Text style={styles.secondaryButtonText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={nextStep}>
                <Text style={styles.primaryButtonText}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 4 && (
          <View style={styles.stepContainer}>
            <View style={styles.stepHeader}>
              <Ionicons name="key-outline" size={32} color={colors.accentPrimary} />
              <Text style={styles.stepTitle}>PIN App Lock</Text>
            </View>
            <Text style={styles.bodyDescription}>
              Create a secure 4-digit PIN. Your finance dashboard will lock automatically when the app is closed.
            </Text>

            {/* Display PIN state */}
            <View style={styles.pinDisplayRow}>
              {pin.length < 4 ? (
                // Enter PIN state
                <View style={styles.pinDotContainer}>
                  <Text style={styles.pinStatusText}>Create PIN</Text>
                  <View style={styles.dotsRow}>
                    {[0, 1, 2, 3].map((idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.pinDot,
                          idx < pin.length && styles.pinDotActive,
                        ]}
                      />
                    ))}
                  </View>
                </View>
              ) : (
                // Confirm PIN state
                <View style={styles.pinDotContainer}>
                  <Text style={styles.pinStatusText}>Confirm PIN</Text>
                  <View style={styles.dotsRow}>
                    {[0, 1, 2, 3].map((idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.pinDot,
                          idx < confirmPin.length && styles.pinDotActiveConfirm,
                        ]}
                      />
                    ))}
                  </View>
                </View>
              )}
            </View>

            {renderKeypad()}

            <View style={styles.spacer} />
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  if (pin.length === 4) {
                    // Reset confirmation and go back to creation
                    setPin("");
                    setConfirmPin("");
                  } else {
                    prevStep();
                  }
                }}
              >
                <Text style={styles.secondaryButtonText}>
                  {pin.length === 4 ? "Restart" : "Back"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (pin.length !== 4 || confirmPin.length !== 4) && styles.buttonDisabled,
                ]}
                disabled={pin.length !== 4 || confirmPin.length !== 4}
                onPress={handleFinishOnboarding}
              >
                <Text style={styles.primaryButtonText}>Finish Setup</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  indicatorContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 20,
  },
  indicatorDot: {
    width: 24,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderHairline,
    marginHorizontal: 4,
  },
  indicatorDotActive: {
    backgroundColor: colors.accentPrimary,
  },
  stepContainer: {
    flex: 1,
    justifyContent: "center",
  },
  welcomeTitle: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 56,
    color: colors.accentGold,
    textAlign: "center",
    letterSpacing: 2,
    marginTop: 40,
  },
  swahiliContainer: {
    marginVertical: 24,
    alignItems: "center",
  },
  swahiliQuote: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 18,
    color: colors.textPrimary,
    textAlign: "center",
    fontStyle: "italic",
  },
  englishSub: {
    fontFamily: "Nunito_400Regular",
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  bodyDescription: {
    fontFamily: "Nunito_400Regular",
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 30,
  },
  spacer: {
    flex: 1,
    minHeight: 30,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.accentPrimary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  primaryButtonText: {
    color: colors.bgBase,
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 30,
    marginBottom: 20,
  },
  stepTitle: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 28,
    color: colors.accentGold,
    marginLeft: 10,
    letterSpacing: 1,
  },
  bulletList: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    marginBottom: 20,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
  },
  bulletText: {
    fontFamily: "Nunito_400Regular",
    fontSize: 14,
    color: colors.textPrimary,
    marginLeft: 12,
    flex: 1,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.borderHairline,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 90,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: "Nunito_600SemiBold",
  },
  choiceCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    marginBottom: 16,
  },
  choiceCardActive: {
    borderColor: colors.accentPrimary,
  },
  choiceCardDisabled: {
    opacity: 0.4,
  },
  choiceHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  choiceTitle: {
    fontFamily: "Nunito_700Bold",
    fontSize: 16,
    color: colors.textMuted,
    marginLeft: 10,
  },
  choiceTextActive: {
    color: colors.textPrimary,
  },
  choiceDesc: {
    fontFamily: "Nunito_400Regular",
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: 12,
  },
  badgeSafe: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(122, 155, 92, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeSafeText: {
    fontFamily: "DMMono_500Medium",
    fontSize: 10,
    color: colors.statusIncome,
  },
  badgeWarning: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(201, 162, 39, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeWarningText: {
    fontFamily: "DMMono_500Medium",
    fontSize: 10,
    color: colors.statusPending,
  },
  badgeDisabled: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(154, 147, 136, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeDisabledText: {
    fontFamily: "DMMono_500Medium",
    fontSize: 10,
    color: colors.textMuted,
  },
  balanceInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgSunken,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    paddingHorizontal: 16,
    marginVertical: 40,
    height: 64,
  },
  currencyPrefix: {
    fontFamily: "DMMono_500Medium",
    fontSize: 16,
    color: colors.textMuted,
    marginRight: 10,
  },
  balanceInput: {
    flex: 1,
    fontFamily: "DMMono_500Medium",
    fontSize: 24,
    color: colors.accentGold,
  },
  pinDisplayRow: {
    alignItems: "center",
    marginVertical: 20,
  },
  pinDotContainer: {
    alignItems: "center",
  },
  pinStatusText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    height: 20,
  },
  pinDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.borderHairline,
    marginHorizontal: 8,
  },
  pinDotActive: {
    backgroundColor: colors.accentPrimary,
  },
  pinDotActiveConfirm: {
    backgroundColor: colors.accentGold,
  },
  keypad: {
    marginTop: 20,
    width: "100%",
    paddingHorizontal: 20,
  },
  keypadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 10,
  },
  keypadButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.bgElevated,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderHairline,
  },
  keypadText: {
    fontFamily: "DMMono_500Medium",
    fontSize: 24,
    color: colors.textPrimary,
  },
});
