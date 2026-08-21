import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";import { SafeAreaView } from "react-native-safe-area-context";

import { api, Expense, ExpenseCategory, ExpensesSummary } from "@/src/api";
import { brl, colors, radius, spacing } from "@/src/theme";

const CATEGORIES: { key: ExpenseCategory; label: string; icon: any; tint: string }[] = [
  { key: "campo", label: "Campo", icon: "football", tint: "#1E8449" },
  { key: "churrasco", label: "Churrasco", icon: "flame", tint: "#E67E22" },
  { key: "outros", label: "Outros", icon: "wallet", tint: "#8E44AD" },
];

export default function ExpensesScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpensesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>("campo");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, sum] = await Promise.all([api.listExpenses(), api.expensesSummary()]);
    setItems(list);
    setSummary(sum);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const save = async () => {
    setError(null);
    const val = parseFloat(amount.replace(",", "."));
    if (!description.trim()) {
      setError("Descrição obrigatória");
      return;
    }
    if (isNaN(val) || val <= 0) {
      setError("Valor inválido");
      return;
    }
    setSaving(true);
    try {
      await api.createExpense({ category, description: description.trim(), amount: val });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDescription("");
      setAmount("");
      setCategory("campo");
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const remove = (id: string, desc: string) => {
    const doDelete = async () => {
      await api.deleteExpense(id);
      await load();
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Excluir "${desc}"?`)) doDelete();
      return;
    }
    Alert.alert("Excluir despesa", `Excluir "${desc}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: doDelete },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable testID="back-btn" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Despesas</Text>
          <Pressable
            testID="new-expense-btn"
            onPress={() => setShowForm((s) => !s)}
            style={styles.iconBtn}
          >
            <Ionicons name={showForm ? "close" : "add"} size={22} color={colors.onSurface} />
          </Pressable>
        </View>

        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}
          ListHeaderComponent={
            <View>
              {/* Summary */}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryKicker}>Mês atual</Text>
                <Text style={styles.summaryTotal} testID="expenses-total">
                  {brl(summary?.total || 0)}
                </Text>
                <View style={styles.catsRow}>
                  {CATEGORIES.map((c) => (
                    <View key={c.key} style={styles.catCell}>
                      <View style={[styles.catIcon, { backgroundColor: c.tint + "22" }]}>
                        <Ionicons name={c.icon} size={16} color={c.tint} />
                      </View>
                      <Text style={styles.catLabel}>{c.label}</Text>
                      <Text style={styles.catValue}>{brl(summary?.by_category[c.key] || 0)}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Form */}
              {showForm && (
                <View style={styles.form}>
                  <Text style={styles.formTitle}>Nova despesa</Text>

                  <Text style={styles.label}>Categoria</Text>
                  <View style={styles.catButtons}>
                    {CATEGORIES.map((c) => {
                      const active = category === c.key;
                      return (
                        <Pressable
                          key={c.key}
                          testID={`cat-${c.key}`}
                          onPress={() => setCategory(c.key)}
                          style={[
                            styles.catBtn,
                            active && { borderColor: c.tint, backgroundColor: c.tint + "10" },
                          ]}
                        >
                          <Ionicons name={c.icon} size={16} color={c.tint} />
                          <Text style={[styles.catBtnText, active && { color: c.tint }]}>{c.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={styles.label}>Descrição</Text>
                  <TextInput
                    testID="input-description"
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Ex: Aluguel do campo semana 21/Ago"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Valor (R$)</Text>
                  <TextInput
                    testID="input-amount"
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="150,00"
                    placeholderTextColor={colors.muted}
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />

                  {error && <Text style={styles.error}>{error}</Text>}

                  <Pressable
                    testID="save-expense-btn"
                    style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                    onPress={save}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={18} color="#fff" />
                        <Text style={styles.saveBtnText}>Adicionar</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              )}

              <Text style={styles.sectionTitle}>Lançamentos</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="wallet-outline" size={40} color={colors.muted} />
              <Text style={styles.emptyText}>Nenhuma despesa registrada.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const cat = CATEGORIES.find((c) => c.key === item.category)!;
            return (
              <View style={styles.item} testID={`expense-${item.id}`}>
                <View style={[styles.itemIcon, { backgroundColor: cat.tint + "22" }]}>
                  <Ionicons name={cat.icon} size={18} color={cat.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
                  <Text style={styles.itemMeta}>
                    {cat.label} · {formatDate(item.date)}
                  </Text>
                </View>
                <View style={styles.itemRight}>
                  <Text style={styles.itemAmount}>{brl(item.amount)}</Text>
                  <Pressable
                    testID={`delete-expense-${item.id}`}
                    onPress={() => remove(item.id, item.description)}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "800", color: colors.onSurface },

  summaryCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  summaryKicker: { fontSize: 11, color: colors.muted, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  summaryTotal: { fontSize: 28, fontWeight: "900", color: colors.onSurface, marginTop: 2, marginBottom: spacing.md },
  catsRow: { flexDirection: "row", gap: spacing.sm },
  catCell: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "flex-start",
  },
  catIcon: { width: 26, height: 26, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  catLabel: { fontSize: 10, color: colors.muted, marginTop: 6, fontWeight: "700", textTransform: "uppercase" },
  catValue: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginTop: 2 },

  form: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  formTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface, marginBottom: 4 },
  label: { fontSize: 12, fontWeight: "700", color: colors.muted, marginTop: 4 },
  catButtons: { flexDirection: "row", gap: spacing.sm },
  catBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  catBtnText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  input: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.onSurface,
  },
  error: { color: colors.error, fontSize: 12 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    marginTop: spacing.sm,
  },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemIcon: { width: 40, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  itemDesc: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  itemMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  itemRight: { alignItems: "flex-end", gap: 4 },
  itemAmount: { fontSize: 15, fontWeight: "900", color: colors.error },

  empty: { padding: spacing.xxl, alignItems: "center", gap: spacing.sm },
  emptyText: { color: colors.muted },
});
