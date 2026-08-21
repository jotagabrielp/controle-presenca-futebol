import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, MonthlyItem, MonthlyStatus } from "@/src/api";
import { brl, colors, radius, spacing } from "@/src/theme";

export default function MonthlyScreen() {
  const router = useRouter();
  const [data, setData] = useState<MonthlyStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const d = await api.getMonthlyCurrent();
    setData(d);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const togglePaid = async (item: MonthlyItem) => {
    if (!data) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setData({
      ...data,
      items: data.items.map((it) =>
        it.player.id === item.player.id ? { ...it, paid: !it.paid } : it,
      ),
    });
    try {
      await api.upsertMonthly(item.player.id, data.month, !item.paid);
      await load();
    } catch {
      await load();
    }
  };

  if (loading || !data) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const monthLabel = formatMonth(data.month);
  const deadlineLabel = formatDate(data.deadline);

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable testID="back-btn" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Mensalidades</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={data.items}
        keyExtractor={(it) => it.player.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={
          <View style={styles.headerCard}>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <View
              style={[
                styles.deadlineChip,
                data.past_deadline ? styles.deadlineExpired : styles.deadlineOk,
              ]}
            >
              <Ionicons
                name={data.past_deadline ? "alert-circle" : "time"}
                size={14}
                color={data.past_deadline ? colors.error : colors.brand}
              />
              <Text
                style={[
                  styles.deadlineText,
                  { color: data.past_deadline ? colors.error : colors.brand },
                ]}
              >
                Prazo: 5º dia útil ({deadlineLabel}){data.past_deadline ? " · vencido" : ""}
              </Text>
            </View>
            <View style={styles.totalsRow}>
              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>Recebido</Text>
                <Text style={styles.totalValue}>{brl(data.total_pago)}</Text>
                <Text style={styles.totalSub}>{data.count_pagos} pagos</Text>
              </View>
              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>A receber</Text>
                <Text style={[styles.totalValue, { color: colors.warning }]}>
                  {brl(data.total_previsto - data.total_pago)}
                </Text>
                <Text style={styles.totalSub}>{data.count_pendentes} pendentes</Text>
              </View>
              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>Previsto</Text>
                <Text style={styles.totalValue}>{brl(data.total_previsto)}</Text>
                <Text style={styles.totalSub}>{data.items.length} mensalistas</Text>
              </View>
            </View>
            <Text style={styles.hint}>Toque no ✓ para marcar/desmarcar a mensalidade paga.</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="star-outline" size={40} color={colors.muted} />
            <Text style={styles.emptyText}>Nenhum mensalista cadastrado ainda.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const initials = item.player.name
            .split(" ")
            .slice(0, 2)
            .map((s) => s[0]?.toUpperCase())
            .join("");
          return (
            <View style={[styles.row, item.paid && styles.rowPaid, item.blocked && styles.rowBlocked]}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.player.name}</Text>
                <View style={styles.rowBadges}>
                  {item.paid ? (
                    <View style={styles.badgePaid}>
                      <Ionicons name="checkmark" size={10} color="#fff" />
                      <Text style={styles.badgePaidText}>Pago</Text>
                    </View>
                  ) : item.blocked ? (
                    <View style={styles.badgeBlocked}>
                      <Ionicons name="lock-closed" size={10} color="#fff" />
                      <Text style={styles.badgeBlockedText}>Fora da lista</Text>
                    </View>
                  ) : (
                    <View style={styles.badgePending}>
                      <Ionicons name="time" size={10} color="#8A6A00" />
                      <Text style={styles.badgePendingText}>Pendente</Text>
                    </View>
                  )}
                </View>
              </View>
              <Pressable
                testID={`toggle-monthly-${item.player.id}`}
                onPress={() => togglePaid(item)}
                style={[styles.payBtn, item.paid && styles.payBtnOn]}
              >
                <Ionicons
                  name={item.paid ? "checkmark" : "cash-outline"}
                  size={22}
                  color={item.paid ? "#fff" : colors.brand}
                />
              </Pressable>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

function formatMonth(m: string) {
  const [y, mm] = m.split("-").map(Number);
  const names = [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
  ];
  return `${names[mm - 1]} ${y}`;
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
  headerCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  monthLabel: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  deadlineChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  deadlineOk: { backgroundColor: colors.brandTertiary },
  deadlineExpired: { backgroundColor: "#FDEAEA" },
  deadlineText: { fontSize: 11, fontWeight: "700" },
  totalsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  totalCard: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
  },
  totalLabel: { fontSize: 10, color: colors.muted, fontWeight: "700", textTransform: "uppercase" },
  totalValue: { fontSize: 16, fontWeight: "900", color: colors.onSurface, marginTop: 2 },
  totalSub: { fontSize: 10, color: colors.muted, marginTop: 1 },
  hint: { fontSize: 11, color: colors.muted, marginTop: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowPaid: { backgroundColor: "#F0FAF3", borderColor: colors.success + "55" },
  rowBlocked: { backgroundColor: "#FDEAEA", borderColor: colors.error + "55" },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontWeight: "800", color: colors.onBrandTertiary },
  rowName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowBadges: { flexDirection: "row", gap: 4, marginTop: 4 },
  badgePaid: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
  },
  badgePaidText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  badgePending: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: "#FFF4D6",
  },
  badgePendingText: { fontSize: 10, fontWeight: "800", color: "#8A6A00" },
  badgeBlocked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.error,
  },
  badgeBlockedText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  payBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  payBtnOn: { backgroundColor: colors.success, borderColor: colors.success },
  empty: { padding: spacing.xxl, alignItems: "center", gap: spacing.sm },
  emptyText: { color: colors.muted, textAlign: "center" },
});
