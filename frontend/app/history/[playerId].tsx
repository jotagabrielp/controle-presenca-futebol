import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";

export default function PlayerHistory() {
  const router = useRouter();
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId) return;
    api
      .playerHistory(playerId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [playerId]);

  const remove = () => {
    Alert.alert("Excluir jogador", `Tem certeza que deseja excluir ${data?.player?.name}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          await api.deletePlayer(playerId!);
          router.back();
        },
      },
    ]);
  };

  if (loading || !data) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const isMensa = data.player.type === "mensalista";

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable testID="back-btn" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Histórico</Text>
        <Pressable testID="delete-player-btn" onPress={remove} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={20} color={colors.error} />
        </Pressable>
      </View>

      <FlatList
        data={data.history}
        keyExtractor={(item) => item.week.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            <View style={styles.profileCard}>
              <View style={[styles.avatar, { backgroundColor: isMensa ? colors.brandTertiary : "#EAF2F8" }]}>
                <Text
                  style={[
                    styles.avatarText,
                    { color: isMensa ? colors.onBrandTertiary : "#1F5F84" },
                  ]}
                >
                  {data.player.name
                    .split(" ")
                    .slice(0, 2)
                    .map((s: string) => s[0]?.toUpperCase())
                    .join("")}
                </Text>
              </View>
              <Text style={styles.name}>{data.player.name}</Text>
              <View style={[styles.typeBadge, { backgroundColor: isMensa ? colors.brandTertiary : "#EAF2F8" }]}>
                <Text style={[styles.typeText, { color: isMensa ? colors.onBrandTertiary : "#1F5F84" }]}>
                  {isMensa ? "Mensalista" : "Convidado"}
                </Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <Stat icon="checkmark-circle" tint={colors.success} value={data.total_present} label="Presenças" />
              <Stat icon="flame" tint="#E67E22" value={data.total_churrasco} label="Churrasco" />
              <Stat icon="cash-outline" tint={colors.brand} value={data.total_paid} label="Pagas" />
            </View>

            <Text style={styles.sectionTitle}>Semanas</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Sem histórico ainda</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.weekRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.weekLabel}>{item.week.label}</Text>
              <View style={styles.tagsRow}>
                {item.attending ? (
                  <Tag icon="checkmark" text="Presente" color={colors.success} />
                ) : (
                  <Tag icon="close" text="Ausente" color={colors.muted} />
                )}
                {item.churrasco && <Tag icon="flame" text="Churrasco" color="#E67E22" />}
                {item.paid && <Tag icon="cash" text="Pago" color={colors.brand} />}
              </View>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function Stat({ icon, tint, value, label }: any) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: tint + "22" }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Tag({ icon, text, color }: any) {
  return (
    <View style={[styles.tag, { backgroundColor: color + "22" }]}>
      <Ionicons name={icon} size={10} color={color} />
      <Text style={[styles.tagText, { color }]}>{text}</Text>
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
  profileCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.sm,
  },
  avatar: { width: 72, height: 72, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 24, fontWeight: "900" },
  name: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  typeBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill },
  typeText: { fontSize: 12, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.lg },
  stat: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  statIcon: { width: 30, height: 30, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 20, fontWeight: "900", color: colors.onSurface, marginTop: 4 },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  weekRow: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekLabel: { fontSize: 14, fontWeight: "700", color: colors.onSurface, marginBottom: 6 },
  tagsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tag: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  tagText: { fontSize: 10, fontWeight: "800" },
  empty: { padding: spacing.xxl, alignItems: "center" },
  emptyText: { color: colors.muted },
});
