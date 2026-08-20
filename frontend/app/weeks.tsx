import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, Summary, Week } from "@/src/api";
import { brl, colors, radius, spacing } from "@/src/theme";

export default function Weeks() {
  const router = useRouter();
  const [items, setItems] = useState<{ week: Week; summary: Summary }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listWeeks()
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable testID="back-btn" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Semanas anteriores</Text>
        <Pressable
          testID="new-week-btn"
          onPress={async () => {
            await api.newWeek();
            const list = await api.listWeeks();
            setItems(list);
          }}
          style={styles.iconBtn}
        >
          <Ionicons name="add" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.week.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyText}>Nenhuma semana registrada ainda</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card} testID={`week-card-${item.week.id}`}>
              <View style={styles.cardHead}>
                <View style={styles.calBadge}>
                  <Ionicons name="calendar" size={14} color={colors.onBrandTertiary} />
                </View>
                <Text style={styles.cardTitle}>{item.week.label}</Text>
              </View>
              <View style={styles.metricsRow}>
                <Metric label="Confirmados" value={item.summary.count_confirmados} />
                <Metric label="Churrasco" value={item.summary.count_churrasco} />
                <Metric label="Pagos" value={item.summary.count_pagos} />
              </View>
              <View style={styles.moneyRow}>
                <View style={styles.moneyChip}>
                  <Text style={styles.moneyChipLabel}>Total</Text>
                  <Text style={styles.moneyChipValue}>{brl(item.summary.total_arrecadado)}</Text>
                </View>
                <View style={[styles.moneyChip, { backgroundColor: "#E6F7EC" }]}>
                  <Text style={[styles.moneyChipLabel, { color: colors.success }]}>Pago</Text>
                  <Text style={[styles.moneyChipValue, { color: colors.success }]}>
                    {brl(item.summary.total_pago)}
                  </Text>
                </View>
                <View style={[styles.moneyChip, { backgroundColor: "#FFF4D6" }]}>
                  <Text style={[styles.moneyChipLabel, { color: "#8A6A00" }]}>Pendente</Text>
                  <Text style={[styles.moneyChipValue, { color: "#8A6A00" }]}>
                    {brl(item.summary.total_pendente)}
                  </Text>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyText: { color: colors.muted },
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  calBadge: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  metricsRow: { flexDirection: "row", gap: spacing.sm },
  metric: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
  },
  metricValue: { fontSize: 20, fontWeight: "900", color: colors.onSurface },
  metricLabel: { fontSize: 11, color: colors.muted, marginTop: 2 },
  moneyRow: { flexDirection: "row", gap: spacing.sm },
  moneyChip: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
  },
  moneyChipLabel: { fontSize: 10, color: colors.onBrandTertiary, fontWeight: "700", textTransform: "uppercase" },
  moneyChipValue: { fontSize: 14, fontWeight: "800", color: colors.onBrandTertiary, marginTop: 2 },
});
