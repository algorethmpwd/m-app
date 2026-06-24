import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

const CATEGORY_META = {
  "cart-outline": { label: "Shopping", color: "#818cf8" },
  "home-outline": { label: "Bills & Rent", color: "#a855f7" },
  "logo-youtube": { label: "Subscriptions", color: "#f43f5e" },
  "restaurant-outline": { label: "Food & Dining", color: "#f59e0b" },
  "car-outline": { label: "Transport", color: "#06b6d4" },
  "gift-outline": { label: "Gifts", color: "#ec4899" },
  "swap-horizontal": { label: "Other", color: "#64748b" },
};

export default function InsightsScreen({ transactions, budgets, onDeleteTransaction }) {
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Formatting helpers
  const formatAmount = (value) => {
    const absVal = Math.abs(value);
    return absVal.toLocaleString("en-US", {
      minimumFractionDigits: absVal % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
  };

  // 1. Group expenses (amount < 0) by category
  const expenses = transactions.filter((t) => t.amount < 0);
  
  const categorySpend = expenses.reduce((acc, t) => {
    const cat = t.icon || "swap-horizontal";
    acc[cat] = (acc[cat] || 0) + Math.abs(t.amount);
    return acc;
  }, {});

  const totalExpenses = Object.values(categorySpend).reduce((sum, val) => sum + val, 0);

  // 2. Select category filter details
  const handleCategoryPress = (category) => {
    if (selectedCategory === category) {
      setSelectedCategory(null); // Clear filter
    } else {
      setSelectedCategory(category);
    }
  };

  // Filtered transactions list
  const filteredTxs = selectedCategory
    ? expenses.filter((t) => (t.icon || "swap-horizontal") === selectedCategory)
    : [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.screenHeader}>Expenditure Insights</Text>

        {totalExpenses > 0 ? (
          <View style={styles.chartCard}>
            <View style={styles.chartTitleRow}>
              <Ionicons name="bar-chart-outline" size={20} color={colors.accentPrimary} />
              <Text style={styles.chartTitle}>Spending by Category</Text>
            </View>

            {/* Vertical Bar Graph */}
            <View style={styles.barContainer}>
              {Object.entries(categorySpend).map(([iconName, amount]) => {
                const meta = CATEGORY_META[iconName] || CATEGORY_META["swap-horizontal"];
                const percentage = (amount / totalExpenses) * 100;
                const barHeight = (percentage / 100) * 100; // max height 100px
                const isActive = selectedCategory === iconName;

                return (
                  <TouchableOpacity
                    key={iconName}
                    style={[styles.barItem, isActive && styles.barItemActive]}
                    onPress={() => handleCategoryPress(iconName)}
                  >
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: Math.max(barHeight, 4),
                            backgroundColor: isActive ? colors.accentGold : colors.accentEmber,
                          },
                        ]}
                      />
                    </View>
                    <Ionicons
                      name={iconName}
                      size={18}
                      color={isActive ? colors.accentGold : colors.textMuted}
                      style={{ marginTop: 8 }}
                    />
                    <Text style={[styles.barPercentText, isActive && styles.textActive]}>
                      {percentage.toFixed(0)}%
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.tapTip}>Tap a category bar to filter transactions</Text>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="pie-chart-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No expenditures logged to calculate insights.</Text>
          </View>
        )}

        {/* Selected Category Details / Transactions Filter */}
        {selectedCategory && (
          <View style={styles.filterSection}>
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>
                {(CATEGORY_META[selectedCategory] || CATEGORY_META["swap-horizontal"]).label} Logs
              </Text>
              <TouchableOpacity onPress={() => setSelectedCategory(null)}>
                <Text style={styles.clearFilterText}>Clear Filter</Text>
              </TouchableOpacity>
            </View>

            {filteredTxs.map((item) => (
              <View key={item.id} style={styles.filteredRow}>
                <View>
                  <Text style={styles.filteredTitle}>{item.title}</Text>
                  <Text style={styles.filteredDate}>
                    {new Date(item.date).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.filteredAmount}>
                  Ksh {formatAmount(item.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Category Budget Bars */}
        {totalExpenses > 0 && (
          <View style={styles.budgetsSection}>
            <Text style={styles.sectionTitle}>Monthly Budgets</Text>
            
            {Object.entries(categorySpend).map(([iconName, amount]) => {
              const meta = CATEGORY_META[iconName] || CATEGORY_META["swap-horizontal"];
              const budgetLimit = budgets[iconName];
              
              // Only render budget bars if a budget limit is defined for this category
              if (!budgetLimit) return null;

              const percentage = (amount / budgetLimit) * 100;
              
              // Shifting fill color based on limits:
              let barColor = colors.statusIncome; // Green < 80%
              if (percentage >= 100) {
                barColor = colors.statusExpense; // Clay red >= 100%
              } else if (percentage >= 80) {
                barColor = colors.statusPending; // Gold warning >= 80%
              }

              return (
                <View key={iconName} style={styles.budgetProgressRow}>
                  <View style={styles.budgetLabelRow}>
                    <Text style={styles.budgetLabel}>{meta.label}</Text>
                    <Text style={styles.budgetMeta}>
                      Ksh {formatAmount(amount)} / {formatAmount(budgetLimit)}
                    </Text>
                  </View>
                  
                  {/* Budget bar (8px height) */}
                  <View style={styles.budgetTrack}>
                    <View
                      style={[
                        styles.budgetFill,
                        {
                          width: `${Math.min(percentage, 100)}%`,
                          backgroundColor: barColor,
                        },
                      ]}
                    />
                  </View>
                  
                  <View style={styles.budgetTextRow}>
                    <Text style={[styles.budgetText, { color: barColor }]}>
                      {percentage.toFixed(0)}% used
                    </Text>
                    {percentage >= 100 && (
                      <Text style={styles.budgetOverText}>Limit Exceeded</Text>
                    )}
                  </View>
                </View>
              );
            })}
            
            {/* If budgets set, show instructions, else remind they can set them in settings */}
            {Object.keys(budgets).length === 0 && (
              <View style={styles.noBudgetsCard}>
                <Text style={styles.noBudgetsText}>
                  No category limits configured.
                </Text>
                <Text style={styles.noBudgetsSubText}>
                  Go to Settings → Budget Manager to set category caps.
                </Text>
              </View>
            )}
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
  chartCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: 16,
    marginBottom: 24,
  },
  chartTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  chartTitle: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 15,
    color: colors.textPrimary,
    marginLeft: 8,
  },
  barContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    height: 140,
  },
  barItem: {
    alignItems: "center",
    width: 44,
    paddingVertical: 6,
    borderRadius: 6,
  },
  barItemActive: {
    backgroundColor: colors.bgSunken,
    borderWidth: 1,
    borderColor: colors.borderHairline,
  },
  barTrack: {
    height: 100,
    width: 12,
    backgroundColor: colors.bgSunken,
    borderRadius: 6,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    borderRadius: 6,
  },
  barPercentText: {
    fontFamily: "DMMono_500Medium",
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 4,
  },
  textActive: {
    color: colors.accentGold,
    fontWeight: "700",
  },
  tapTip: {
    fontFamily: "Nunito_400Regular",
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 16,
  },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
  },
  emptyText: {
    fontFamily: "Nunito_400Regular",
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 12,
    paddingHorizontal: 20,
  },
  filterSection: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: 16,
    marginBottom: 24,
  },
  filterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  filterTitle: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 18,
    color: colors.accentGold,
    letterSpacing: 0.5,
  },
  clearFilterText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 12,
    color: colors.statusExpense,
  },
  filteredRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHairline,
  },
  filteredTitle: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
    color: colors.textPrimary,
  },
  filteredDate: {
    fontFamily: "DMMono_500Medium",
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  filteredAmount: {
    fontFamily: "DMMono_500Medium",
    fontSize: 14,
    color: colors.statusExpense,
  },
  budgetsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 22,
    color: colors.textPrimary,
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  budgetProgressRow: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: 16,
    marginBottom: 12,
  },
  budgetLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  budgetLabel: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
    color: colors.textPrimary,
  },
  budgetMeta: {
    fontFamily: "DMMono_500Medium",
    fontSize: 11,
    color: colors.textMuted,
  },
  budgetTrack: {
    height: 8, // 8px budget bar
    backgroundColor: colors.bgSunken,
    borderRadius: 4,
    overflow: "hidden",
  },
  budgetFill: {
    height: "100%",
    borderRadius: 4,
  },
  budgetTextRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  budgetText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 11,
  },
  budgetOverText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 11,
    color: colors.statusExpense,
  },
  noBudgetsCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    padding: 20,
    alignItems: "center",
  },
  noBudgetsText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
    color: colors.textPrimary,
  },
  noBudgetsSubText: {
    fontFamily: "Nunito_400Regular",
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: "center",
  },
});
