import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

export default function LockScreen({ correctPin, onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const handleKeyPress = (num) => {
    if (error) {
      setError(false);
      setPin("");
    }

    if (num === "delete") {
      setPin((prev) => prev.slice(0, -1));
    } else {
      if (pin.length < 4) {
        const newPin = pin + num;
        setPin(newPin);

        if (newPin.length === 4) {
          // Check PIN
          if (newPin === correctPin) {
            onUnlock();
          } else {
            // Error state
            setError(true);
            Vibration.vibrate(300);
            setTimeout(() => {
              setPin("");
              setError(false);
            }, 1000);
          }
        }
      }
    }
  };

  const keys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["", "0", "⌫"],
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="lock-closed" size={40} color={colors.accentPrimary} />
        <Text style={styles.title}>VAULT SECURED</Text>
        <Text style={styles.subtitle}>Enter PIN to unlock your dashboard</Text>

        <View style={styles.dotsContainer}>
          {[0, 1, 2, 3].map((idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                idx < pin.length && styles.dotActive,
                error && styles.dotError,
              ]}
            />
          ))}
        </View>

        {error && <Text style={styles.errorText}>Invalid PIN. Try again.</Text>}

        <View style={styles.keypad}>
          {keys.map((row, i) => (
            <View key={i} style={styles.keypadRow}>
              {row.map((key, j) => {
                if (key === "") return <View key={j} style={styles.keypadButtonPlaceholder} />;
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  title: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 32,
    color: colors.accentGold,
    marginTop: 20,
    letterSpacing: 1,
  },
  subtitle: {
    fontFamily: "Nunito_400Regular",
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 6,
    marginBottom: 40,
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    height: 20,
    marginBottom: 20,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.borderHairline,
    marginHorizontal: 12,
  },
  dotActive: {
    backgroundColor: colors.accentPrimary,
  },
  dotError: {
    backgroundColor: colors.statusExpense,
  },
  errorText: {
    fontFamily: "Nunito_600SemiBold",
    color: colors.statusExpense,
    fontSize: 14,
    marginBottom: 20,
  },
  keypad: {
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
  keypadButtonPlaceholder: {
    width: 70,
    height: 70,
  },
  keypadText: {
    fontFamily: "DMMono_500Medium",
    fontSize: 24,
    color: colors.textPrimary,
  },
});
