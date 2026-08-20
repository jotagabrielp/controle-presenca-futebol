import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Attendance, CurrentWeek, Player, PixSettings } from "@/src/api";
import { PRICES, brl, colors, radius, spacing } from "@/src/theme";

const HERO_URL =
  "https://images.unsplash.com/photo-1459865264687-595d652de67e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHwzfHxmb290YmFsbCUyMGZpZWxkJTIwcGl0Y2glMjBncmFzc3xlbnwwfHx8fDE3ODMwMDEzMTR8MA&ixlib=rb-4.1.0&q=85";

const APP_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";

type FilterKey = "todos" | "mensalista" | "convidado";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "mensalista", label: "Mensalistas" },
  { key: "convidado", label: "Convidados" },
];

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [current, setCurrent] = useState<CurrentWeek | null>(null);
  const [pix, setPix] = useState<PixSettings>({ pix_key: "", holder_name: "", bank: "" });
  const [filter, setFilter] = useState<FilterKey>("todos");

  const load = useCallback(async () => {
    try {
      const [pl, cw, px] = await Promise.all([api.listPlayers(), api.getCurrentWeek(), api.getPix()]);
      setPlayers(pl);
      setCurrent(cw);
      setPix(px);
    } catch (e) {
      console.log("load error", e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const attendanceMap = useMemo(() => {
    const m = new Map<string, Attendance>();
    current?.attendance.forEach((a) => m.set(a.player_id, a));
    return m;
  }, [current]);

  const filteredPlayers = useMemo(() => {
    if (filter === "todos") return players;
    return players.filter((p) => p.type === filter);
  }, [players, filter]);

  const setAttendance = async (playerId: string, patch: Partial<Attendance>) => {
    if (!current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // optimistic update
    const prev = attendanceMap.get(playerId);
    const optimistic: Attendance = {
      week_id: current.week.id,
      player_id: playerId,
      attending: patch.attending ?? prev?.attending ?? false,
      churrasco: patch.churrasco ?? prev?.churrasco ?? false,
      paid: patch.paid ?? prev?.paid ?? false,
    };
    if (patch.attending === false) {
      optimistic.churrasco = false;
      optimistic.paid = false;
    }
    if (patch.churrasco === true && !optimistic.attending) {
      optimistic.attending = true;
    }
    setCurrent((c) => {
      if (!c) return c;
      const others = c.attendance.filter((a) => a.player_id !== playerId);
      return { ...c, attendance: [...others, optimistic] };
    });
    try {
      await api.upsertAttendance({
        week_id: current.week.id,
        player_id: playerId,
        ...patch,
      });
      const cw = await api.getCurrentWeek();
      setCurrent(cw);
    } catch (e) {
      console.log("attendance err", e);
      onRefresh();
    }
  };

  const shareWhatsApp = async () => {
    if (!current) return;
    const lines: string[] = [];
    lines.push(`*⚽ Lista Futebol - ${current.week.label}*`);
    lines.push("");
    const mensalistas = players.filter(
      (p) => p.type === "mensalista" && attendanceMap.get(p.id)?.attending,
    );
    const convidados = players.filter(
      (p) => p.type === "convidado" && attendanceMap.get(p.id)?.attending,
    );
    lines.push(`*Mensalistas (${brl(PRICES.MENSALISTA)}):*`);
    mensalistas.forEach((p, i) => {
      const a = attendanceMap.get(p.id);
      const churras = a?.churrasco ? " 🍖" : "";
      const paid = a?.paid ? " ✅" : "";
      lines.push(`${i + 1}. ${p.name}${churras}${paid}`);
    });
    if (mensalistas.length === 0) lines.push("_(vazio)_");
    lines.push("");
    lines.push(`*Convidados (${brl(PRICES.CONVIDADO)}):*`);
    convidados.forEach((p, i) => {
      const a = attendanceMap.get(p.id);
      const churras = a?.churrasco ? " 🍖" : "";
      const paid = a?.paid ? " ✅" : "";
      lines.push(`${i + 1}. ${p.name}${churras}${paid}`);
    });
    if (convidados.length === 0) lines.push("_(vazio)_");
    lines.push("");
    const s = current.summary;
    lines.push(`🍖 Churrasco: ${s.count_churrasco} pessoas (${brl(PRICES.CHURRASCO)} cada)`);
    lines.push("");
    lines.push(`💰 *Total: ${brl(s.total_arrecadado)}*`);
    lines.push(`✅ Pago: ${brl(s.total_pago)} · ⏳ Pendente: ${brl(s.total_pendente)}`);
    if (pix.pix_key) {
      lines.push("");
      lines.push(`*Pix:* ${pix.pix_key}`);
      if (pix.holder_name) lines.push(`_${pix.holder_name}_`);
    }
    if (APP_URL) {
      lines.push("");
      lines.push(`👉 Confirme sua presença no app: ${APP_URL}`);
    }
    const url = `whatsapp://send?text=${encodeURIComponent(lines.join("\n"))}`;
    const can = await Linking.canOpenURL(url);
    if (can) Linking.openURL(url);
    else Linking.openURL(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`);
  };

  const inviteFriends = async () => {
    if (!APP_URL) return;
    const msg =
      `⚽ *Fala, galera!* Entra no app da nossa lista de futebol:\n\n` +
      `👉 ${APP_URL}\n\n` +
      `Lá você confirma presença, marca o churrasco 🍖 e paga via Pix. Simples assim!`;
    const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    const can = await Linking.canOpenURL(url);
    if (can) Linking.openURL(url);
    else Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`);
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen} testID="home-loading">
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={filteredPlayers}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: 180 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        ListHeaderComponent={
          <Header
            weekLabel={current?.week.label || ""}
            summary={current?.summary}
            onSettings={() => router.push("/settings")}
            onWeeks={() => router.push("/weeks")}
            onInvite={inviteFriends}
            filter={filter}
            setFilter={setFilter}
            confirmed={current?.summary.count_confirmados || 0}
            total={players.length}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty} testID="home-empty">
            <Ionicons name="football-outline" size={64} color={colors.brand} />
            <Text style={styles.emptyTitle}>Nenhum jogador cadastrado</Text>
            <Text style={styles.emptySub}>Toque em &quot;Adicionar Jogador&quot; para começar!</Text>
          </View>
        }
        renderItem={({ item }) => {
          const a = attendanceMap.get(item.id);
          return (
            <PlayerCard
              player={item}
              attending={!!a?.attending}
              churrasco={!!a?.churrasco}
              paid={!!a?.paid}
              onToggleAttend={() => setAttendance(item.id, { attending: !a?.attending })}
              onToggleChurras={() => setAttendance(item.id, { churrasco: !a?.churrasco })}
              onTogglePaid={() => setAttendance(item.id, { paid: !a?.paid })}
              onOpenHistory={() => router.push(`/history/${item.id}`)}
              onOpenPix={() => router.push("/pix")}
              hasPix={!!pix.pix_key}
            />
          );
        }}
      />

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          testID="share-whatsapp-btn"
          style={styles.whatsBtn}
          onPress={shareWhatsApp}
        >
          <Ionicons name="logo-whatsapp" size={22} color="#fff" />
        </Pressable>
        <Pressable
          testID="add-player-btn"
          style={styles.addBtn}
          onPress={() => router.push("/add-player")}
        >
          <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
          <Text style={styles.addBtnText}>Adicionar Jogador</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Header({
  weekLabel,
  summary,
  onSettings,
  onWeeks,
  onInvite,
  filter,
  setFilter,
  confirmed,
  total,
}: {
  weekLabel: string;
  summary: any;
  onSettings: () => void;
  onWeeks: () => void;
  onInvite: () => void;
  filter: FilterKey;
  setFilter: (f: FilterKey) => void;
  confirmed: number;
  total: number;
}) {
  return (
    <View>
      <View style={styles.hero}>
        <Image source={HERO_URL} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
        <LinearGradient
          colors={["rgba(30,132,73,0.35)", "rgba(35,43,37,0.85)"]}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView edges={["top"]} style={styles.heroContent}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroKicker}>Semana atual</Text>
              <Text style={styles.heroTitle} testID="week-label">{weekLabel}</Text>
            </View>
            <View style={styles.heroActions}>
              <Pressable testID="invite-friends-btn" style={styles.iconBtn} onPress={onInvite}>
                <Ionicons name="share-social-outline" size={20} color="#fff" />
              </Pressable>
              <Pressable testID="open-weeks-btn" style={styles.iconBtn} onPress={onWeeks}>
                <Ionicons name="calendar-outline" size={20} color="#fff" />
              </Pressable>
              <Pressable testID="open-settings-btn" style={styles.iconBtn} onPress={onSettings}>
                <Ionicons name="settings-outline" size={20} color="#fff" />
              </Pressable>
            </View>
          </View>

          {/* Summary card overlay */}
          <View style={styles.summaryCard} testID="summary-card">
            <View style={styles.summaryHead}>
              <Text style={styles.summaryLabel}>Total arrecadado</Text>
              <View style={styles.confirmBadge}>
                <Ionicons name="people" size={14} color={colors.onBrandTertiary} />
                <Text style={styles.confirmBadgeText}>{confirmed}/{total} confirmados</Text>
              </View>
            </View>
            <Text style={styles.summaryTotal} testID="summary-total">
              {brl(summary?.total_arrecadado || 0)}
            </Text>
            <View style={styles.summaryPayRow}>
              <View style={styles.payChip}>
                <View style={[styles.dot, { backgroundColor: colors.success }]} />
                <Text style={styles.payChipText}>Pago {brl(summary?.total_pago || 0)}</Text>
              </View>
              <View style={styles.payChip}>
                <View style={[styles.dot, { backgroundColor: colors.warning }]} />
                <Text style={styles.payChipText}>Pendente {brl(summary?.total_pendente || 0)}</Text>
              </View>
            </View>
            <View style={styles.summaryGrid}>
              <SummaryCell
                label="Mensalistas"
                value={brl(summary?.total_mensalistas || 0)}
                sub={`${summary?.count_mensalistas || 0} × ${brl(PRICES.MENSALISTA)}`}
                icon="star"
                tint={colors.brandPrimary}
              />
              <SummaryCell
                label="Convidados"
                value={brl(summary?.total_convidados || 0)}
                sub={`${summary?.count_convidados || 0} × ${brl(PRICES.CONVIDADO)}`}
                icon="person-add"
                tint="#3498DB"
              />
              <SummaryCell
                label="Churrasco"
                value={brl(summary?.total_churrasco || 0)}
                sub={`${summary?.count_churrasco || 0} × ${brl(PRICES.CHURRASCO)}`}
                icon="flame"
                tint="#E67E22"
              />
            </View>
          </View>
        </SafeAreaView>
      </View>

      {/* Filter chips */}
      <View style={styles.chipRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRowContent}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                testID={`filter-chip-${f.key}`}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Jogadores</Text>
      </View>
    </View>
  );
}

function SummaryCell({
  label,
  value,
  sub,
  icon,
  tint,
}: {
  label: string;
  value: string;
  sub: string;
  icon: any;
  tint: string;
}) {
  return (
    <View style={styles.summaryCell}>
      <View style={[styles.summaryIcon, { backgroundColor: tint + "22" }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{value}</Text>
      <Text style={styles.cellSub}>{sub}</Text>
    </View>
  );
}

function PlayerCard({
  player,
  attending,
  churrasco,
  paid,
  onToggleAttend,
  onToggleChurras,
  onTogglePaid,
  onOpenHistory,
  onOpenPix,
  hasPix,
}: {
  player: Player;
  attending: boolean;
  churrasco: boolean;
  paid: boolean;
  onToggleAttend: () => void;
  onToggleChurras: () => void;
  onTogglePaid: () => void;
  onOpenHistory: () => void;
  onOpenPix: () => void;
  hasPix: boolean;
}) {
  const initials = player.name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  const isMensa = player.type === "mensalista";
  const price = isMensa ? PRICES.MENSALISTA : PRICES.CONVIDADO;
  const total = price + (churrasco ? PRICES.CHURRASCO : 0);

  return (
    <View style={[styles.card, attending && styles.cardActive]} testID={`player-card-${player.id}`}>
      <View style={styles.cardRow}>
        <Pressable onPress={onOpenHistory} style={styles.avatarWrap} testID={`open-history-${player.id}`}>
          <View style={[styles.avatar, { backgroundColor: isMensa ? colors.brandTertiary : "#EAF2F8" }]}>
            <Text style={[styles.avatarText, { color: isMensa ? colors.onBrandTertiary : "#1F5F84" }]}>
              {initials || "?"}
            </Text>
          </View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.playerName}>{player.name}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.typeBadge, { backgroundColor: isMensa ? colors.brandTertiary : "#EAF2F8" }]}>
              <Ionicons
                name={isMensa ? "star" : "person-add"}
                size={10}
                color={isMensa ? colors.onBrandTertiary : "#1F5F84"}
              />
              <Text style={[styles.typeBadgeText, { color: isMensa ? colors.onBrandTertiary : "#1F5F84" }]}>
                {isMensa ? "Mensalista" : "Convidado"} · {brl(price)}
              </Text>
            </View>
            {attending && (
              <View style={styles.totalBadge}>
                <Text style={styles.totalBadgeText}>Total {brl(total)}</Text>
              </View>
            )}
          </View>
        </View>
        <Pressable
          testID={`toggle-attend-${player.id}`}
          onPress={onToggleAttend}
          style={[styles.checkBtn, attending && styles.checkBtnActive]}
        >
          <Ionicons
            name={attending ? "checkmark" : "add"}
            size={22}
            color={attending ? "#fff" : colors.brand}
          />
        </Pressable>
      </View>

      {attending && (
        <View style={styles.actionsRow}>
          <Pressable
            testID={`toggle-churras-${player.id}`}
            onPress={onToggleChurras}
            style={[styles.actionChip, churrasco && styles.actionChipChurrasOn]}
          >
            <Ionicons name="flame" size={16} color={churrasco ? "#fff" : "#E67E22"} />
            <Text style={[styles.actionChipText, churrasco && { color: "#fff" }]}>
              Churrasco {brl(PRICES.CHURRASCO)}
            </Text>
          </Pressable>
          <Pressable
            testID={`toggle-paid-${player.id}`}
            onPress={onTogglePaid}
            style={[styles.actionChip, paid && styles.actionChipPaidOn]}
          >
            <Ionicons
              name={paid ? "checkmark-circle" : "cash-outline"}
              size={16}
              color={paid ? "#fff" : colors.success}
            />
            <Text style={[styles.actionChipText, paid && { color: "#fff" }]}>
              {paid ? "Pago" : "Marcar pago"}
            </Text>
          </Pressable>
          {hasPix && (
            <Pressable
              testID={`open-pix-${player.id}`}
              onPress={onOpenPix}
              style={styles.pixMiniBtn}
            >
              <Ionicons name="qr-code-outline" size={16} color={colors.brand} />
              <Text style={styles.pixMiniText}>Pix</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  loadingScreen: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },

  hero: { minHeight: 340, backgroundColor: colors.brand, overflow: "hidden" },
  heroContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  heroKicker: { color: "rgba(255,255,255,0.85)", fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 2 },
  heroActions: { flexDirection: "row", gap: spacing.sm },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  summaryCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 8,
  },
  summaryHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryLabel: { color: colors.muted, fontSize: 13 },
  confirmBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  confirmBadgeText: { color: colors.onBrandTertiary, fontSize: 11, fontWeight: "700" },
  summaryTotal: { fontSize: 32, fontWeight: "900", color: colors.onSurface, marginTop: 2 },
  summaryPayRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs, marginBottom: spacing.md },
  payChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  payChipText: { fontSize: 11, color: colors.onSurface, fontWeight: "600" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  summaryGrid: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  summaryCell: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryIcon: { width: 26, height: 26, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  cellLabel: { fontSize: 11, color: colors.muted, marginTop: 6 },
  cellValue: { fontSize: 15, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  cellSub: { fontSize: 10, color: colors.muted, marginTop: 2 },

  chipRowWrap: { marginTop: spacing.md, height: 56, justifyContent: "center" },
  chipRowContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  chip: {
    height: 36,
    flexShrink: 0,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { color: colors.onSurface, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: colors.onSurfaceInverse },

  sectionHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },

  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  cardActive: { borderColor: colors.brand + "55", backgroundColor: "#F6FBF7" },
  cardRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatarWrap: {},
  avatar: { width: 46, height: 46, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 15, fontWeight: "800" },
  playerName: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  badgeRow: { flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  typeBadgeText: { fontSize: 11, fontWeight: "700" },
  totalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSecondary,
  },
  totalBadgeText: { fontSize: 11, fontWeight: "800", color: colors.onBrandSecondary },
  checkBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  checkBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },

  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionChipChurrasOn: { backgroundColor: "#E67E22", borderColor: "#E67E22" },
  actionChipPaidOn: { backgroundColor: colors.success, borderColor: colors.success },
  actionChipText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  pixMiniBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
  },
  pixMiniText: { fontSize: 12, fontWeight: "700", color: colors.brand },

  empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface, marginTop: 8 },
  emptySub: { color: colors.muted, fontSize: 13 },

  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  whatsBtn: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: "#25D366",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addBtnText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 15 },
});
