import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  api,
  Attendance,
  CurrentWeek,
  MonthlyStatus,
  Player,
  PixSettings,
  TeamSettings,
} from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { PRICES, brl, colors, radius, spacing } from "@/src/theme";

const HERO_URL =
  "https://images.unsplash.com/photo-1459865264687-595d652de67e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHwzfHxmb290YmFsbCUyMGZpZWxkJTIwcGl0Y2glMjBncmFzc3xlbnwwfHx8fDE3ODMwMDEzMTR8MA&ixlib=rb-4.1.0&q=85";

const APP_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const GAME_SCHEDULE = "Toda terça, 21h";

type FilterKey = "todos" | "mensalista" | "convidado" | "goleiro";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "mensalista", label: "Mensalistas" },
  { key: "convidado", label: "Convidados" },
  { key: "goleiro", label: "Goleiros" },
];

type PlayerStatus = "confirmed" | "waiting" | "off";

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAdmin, logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [current, setCurrent] = useState<CurrentWeek | null>(null);
  const [pix, setPix] = useState<PixSettings>({ pix_key: "", holder_name: "", bank: "" });
  const [team, setTeam] = useState<TeamSettings>({ team_name: "", team_emoji: "" });
  const [monthly, setMonthly] = useState<MonthlyStatus | null>(null);
  const [filter, setFilter] = useState<FilterKey>("todos");

  const load = useCallback(async () => {
    try {
      const [pl, cw, px, tm, mo] = await Promise.all([
        api.listPlayers(),
        api.getCurrentWeek(),
        api.getPix(),
        api.getTeam(),
        api.getMonthlyCurrent(),
      ]);
      setPlayers(pl);
      setCurrent(cw);
      setPix(px);
      setTeam(tm);
      setMonthly(mo);
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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

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

  const monthlyPaidMap = useMemo(() => {
    const m = new Map<string, boolean>();
    monthly?.items.forEach((it) => m.set(it.player.id, it.paid));
    return m;
  }, [monthly]);

  const getStatus = useCallback(
    (p: Player): PlayerStatus => {
      const a = attendanceMap.get(p.id);
      if (!a?.attending) return "off";
      if (p.type === "goleiro") return "confirmed";
      if (p.type === "convidado") {
        return a.paid ? "confirmed" : "waiting";
      }
      // mensalista
      const paidMonth = monthlyPaidMap.get(p.id) || false;
      if (monthly?.past_deadline && !paidMonth) return "waiting";
      return "confirmed";
    },
    [attendanceMap, monthlyPaidMap, monthly],
  );

  const filteredPlayers = useMemo(() => {
    if (filter === "todos") return players;
    return players.filter((p) => p.type === filter);
  }, [players, filter]);

  const confirmedPlayers = useMemo(
    () => filteredPlayers.filter((p) => getStatus(p) === "confirmed"),
    [filteredPlayers, getStatus],
  );
  const waitingPlayers = useMemo(
    () => filteredPlayers.filter((p) => getStatus(p) === "waiting"),
    [filteredPlayers, getStatus],
  );
  const offPlayers = useMemo(
    () => filteredPlayers.filter((p) => getStatus(p) === "off"),
    [filteredPlayers, getStatus],
  );

  const setAttendance = async (playerId: string, patch: Partial<Attendance>) => {
    if (!current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
      await api.upsertAttendance({ week_id: current.week.id, player_id: playerId, ...patch });
      const cw = await api.getCurrentWeek();
      setCurrent(cw);
    } catch (e) {
      console.log("attendance err", e);
      onRefresh();
    }
  };

  const shareWhatsApp = async () => {
    if (!current) return;
    const teamLabel = team.team_name || "Lista Futebol";
    const emoji = team.team_emoji || "⚽";
    const lines: string[] = [];
    lines.push(`*${emoji} ${teamLabel} - ${current.week.label}*`);
    lines.push(`🗓️ ${GAME_SCHEDULE}`);
    lines.push("");

    const mensa = confirmedPlayers.filter((p) => p.type === "mensalista");
    const conv = confirmedPlayers.filter((p) => p.type === "convidado");
    const goal = confirmedPlayers.filter((p) => p.type === "goleiro");

    lines.push(`*Mensalistas em dia:*`);
    mensa.forEach((p, i) => {
      const a = attendanceMap.get(p.id);
      const churras = a?.churrasco ? " 🍖" : "";
      lines.push(`${i + 1}. ${p.name}${churras}`);
    });
    if (mensa.length === 0) lines.push("_(vazio)_");
    lines.push("");
    lines.push(`*Convidados (${brl(PRICES.CONVIDADO)}) - pagos:*`);
    conv.forEach((p, i) => {
      const a = attendanceMap.get(p.id);
      const churras = a?.churrasco ? " 🍖" : "";
      lines.push(`${i + 1}. ${p.name}${churras}`);
    });
    if (conv.length === 0) lines.push("_(vazio)_");
    lines.push("");
    lines.push(`*Goleiros:*`);
    goal.forEach((p, i) => {
      const a = attendanceMap.get(p.id);
      const churras = a?.churrasco ? " 🍖" : "";
      lines.push(`${i + 1}. ${p.name}${churras}`);
    });
    if (goal.length === 0) lines.push("_(vazio)_");

    if (waitingPlayers.length > 0) {
      lines.push("");
      lines.push(`⏳ *Lista de espera (aguardando pagamento):*`);
      waitingPlayers.forEach((p, i) => {
        const tag = p.type === "mensalista" ? "mensalidade" : "convite";
        lines.push(`${i + 1}. ${p.name} _(${tag})_`);
      });
    }

    lines.push("");
    const s = current.summary;
    lines.push(`🍖 Churrasco: ${s.count_churrasco} pessoas`);
    lines.push(`💰 *Arrecadado na semana: ${brl(s.total_arrecadado)}*`);
    lines.push(`(convidados + churrasco. Mensalidade é mensal.)`);
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
    const teamLabel = team.team_name || "nossa lista de futebol";
    const emoji = team.team_emoji || "⚽";
    const msg =
      `${emoji} *Fala, galera!* Entra no app da ${teamLabel}:\n\n` +
      `🗓️ ${GAME_SCHEDULE}\n` +
      `👉 ${APP_URL}\n\n` +
      `Lá você confirma presença, marca o churrasco 🍖 e paga via Pix.`;
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

  const renderPlayer = (p: Player) => {
    const a = attendanceMap.get(p.id);
    const status = getStatus(p);
    const paidMonth = monthlyPaidMap.get(p.id) || false;
    return (
      <PlayerCard
        key={p.id}
        player={p}
        attending={!!a?.attending}
        churrasco={!!a?.churrasco}
        paid={!!a?.paid}
        status={status}
        paidMonth={paidMonth}
        pastDeadline={!!monthly?.past_deadline}
        onToggleAttend={() => setAttendance(p.id, { attending: !a?.attending })}
        onToggleChurras={() => setAttendance(p.id, { churrasco: !a?.churrasco })}
        onTogglePaid={() => setAttendance(p.id, { paid: !a?.paid })}
        onOpenHistory={() => router.push(`/history/${p.id}`)}
        onOpenPix={() => router.push("/pix")}
        onOpenMonthly={() => router.push("/monthly")}
        onEdit={() => router.push(`/player/${p.id}`)}
        hasPix={!!pix.pix_key}
        isAdmin={isAdmin}
      />
    );
  };

  return (
    <View style={styles.root}>
      <FlatList
        data={[]}
        keyExtractor={() => "x"}
        renderItem={() => null}
        contentContainerStyle={{ paddingBottom: 180 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        ListHeaderComponent={
          <>
            <Header
              weekLabel={current?.week.label || ""}
              schedule={GAME_SCHEDULE}
              summary={current?.summary}
              monthly={monthly}
              onSettings={() => router.push("/settings")}
              onWeeks={() => router.push("/weeks")}
              onInvite={inviteFriends}
              onMonthly={() => router.push("/monthly")}
              onExpenses={() => router.push("/expenses")}
              onAdmin={() => router.push("/admin-login")}
              onLogout={logout}
              team={team}
              isAdmin={isAdmin}
            />

            {/* Filter chips */}
            <View style={styles.chipRowWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowContent}>
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

            {/* Confirmed */}
            <SectionHeader
              title="Lista confirmada"
              subtitle={`${confirmedPlayers.length} jogador${confirmedPlayers.length === 1 ? "" : "es"}`}
              icon="checkmark-circle"
              tint={colors.success}
            />
            {confirmedPlayers.length === 0 ? (
              <EmptySection text="Ninguém confirmado ainda esta semana." />
            ) : (
              confirmedPlayers.map(renderPlayer)
            )}

            {/* Waiting */}
            {waitingPlayers.length > 0 && (
              <>
                <SectionHeader
                  title="Lista de espera"
                  subtitle={`${waitingPlayers.length} aguardando pagamento`}
                  icon="hourglass-outline"
                  tint="#E67E22"
                />
                {waitingPlayers.map(renderPlayer)}
              </>
            )}

            {/* Off / não confirmou */}
            {offPlayers.length > 0 && (
              <>
                <SectionHeader
                  title="Não confirmaram"
                  subtitle={`${offPlayers.length} jogador${offPlayers.length === 1 ? "" : "es"}`}
                  icon="ellipsis-horizontal-circle-outline"
                  tint={colors.muted}
                />
                {offPlayers.map(renderPlayer)}
              </>
            )}
          </>
        }
      />

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable testID="share-whatsapp-btn" style={styles.whatsBtn} onPress={shareWhatsApp}>
          <Ionicons name="logo-whatsapp" size={22} color="#fff" />
        </Pressable>
        <Pressable
          testID="invite-link-btn"
          style={styles.inviteBtn}
          onPress={() => router.push("/invite")}
        >
          <Ionicons name="person-add-outline" size={20} color={colors.brand} />
          <Text style={styles.inviteBtnText}>Convidar</Text>
        </Pressable>
        {isAdmin && (
          <Pressable testID="add-player-btn" style={styles.addBtn} onPress={() => router.push("/add-player")}>
            <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
            <Text style={styles.addBtnText}>Jogador</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Header({
  weekLabel,
  schedule,
  summary,
  monthly,
  onSettings,
  onWeeks,
  onInvite,
  onMonthly,
  onExpenses,
  onAdmin,
  onLogout,
  team,
  isAdmin,
}: {
  weekLabel: string;
  schedule: string;
  summary: any;
  monthly: MonthlyStatus | null;
  onSettings: () => void;
  onWeeks: () => void;
  onInvite: () => void;
  onMonthly: () => void;
  onExpenses: () => void;
  onAdmin: () => void;
  onLogout: () => void;
  team: TeamSettings;
  isAdmin: boolean;
}) {
  const teamName = team.team_name || "Turma do Futebol";
  const teamEmoji = team.team_emoji || "⚽";
  return (
    <View>
      <View style={styles.hero}>
        <Image source={HERO_URL} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
        <LinearGradient
          colors={["rgba(30,132,73,0.35)", "rgba(35,43,37,0.9)"]}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView edges={["top"]} style={styles.heroContent}>
          <View style={styles.heroTopRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.teamRow}>
                <Text style={styles.teamEmoji}>{teamEmoji}</Text>
                <Text style={styles.teamName} numberOfLines={1} testID="team-name">
                  {teamName}
                </Text>
              </View>
              <View style={styles.scheduleRow}>
                <Ionicons name="time-outline" size={12} color="#fff" />
                <Text style={styles.scheduleText} testID="game-schedule">{schedule}</Text>
              </View>
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
              {isAdmin ? (
                <>
                  <Pressable testID="open-settings-btn" style={styles.iconBtn} onPress={onSettings}>
                    <Ionicons name="settings-outline" size={20} color="#fff" />
                  </Pressable>
                  <Pressable testID="admin-logout-btn" style={styles.iconBtn} onPress={onLogout}>
                    <Ionicons name="log-out-outline" size={20} color="#fff" />
                  </Pressable>
                </>
              ) : (
                <Pressable testID="admin-login-btn" style={styles.iconBtn} onPress={onAdmin}>
                  <Ionicons name="shield-outline" size={20} color="#fff" />
                </Pressable>
              )}
            </View>
          </View>

          {/* Weekly total */}
          <View style={styles.summaryCard} testID="summary-card">
            <View style={styles.summaryHead}>
              <Text style={styles.summaryLabel}>Arrecadado na semana</Text>
              <View style={styles.confirmBadge}>
                <Ionicons name="people" size={14} color={colors.onBrandTertiary} />
                <Text style={styles.confirmBadgeText}>{summary?.count_confirmados || 0} confirmados</Text>
              </View>
            </View>
            <Text style={styles.summaryTotal} testID="summary-total">
              {brl(summary?.total_arrecadado || 0)}
            </Text>
            <Text style={styles.summaryHint}>Convidados + Churrasco. Mensalidade é cobrada mensalmente.</Text>
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

      {/* Monthly + Expenses shortcuts (admin only) */}
      {isAdmin && (
        <View style={styles.tabRow}>
          <Pressable style={styles.tabBtn} onPress={onMonthly} testID="open-monthly-btn">
            <View style={[styles.tabIcon, { backgroundColor: colors.brand + "22" }]}>
              <Ionicons name="star" size={18} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tabTitle}>Mensalidades</Text>
              <Text style={styles.tabSub}>
                {monthly ? `${monthly.count_pagos}/${monthly.items.length} pagos` : "-"}
                {monthly?.past_deadline ? " · prazo vencido" : ""}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
          <Pressable style={styles.tabBtn} onPress={onExpenses} testID="open-expenses-btn">
            <View style={[styles.tabIcon, { backgroundColor: "#D32F2F22" }]}>
              <Ionicons name="wallet-outline" size={18} color="#D32F2F" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tabTitle}>Despesas</Text>
              <Text style={styles.tabSub}>Campo, churrasco e outros</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function SectionHeader({ title, subtitle, icon, tint }: any) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIcon, { backgroundColor: tint + "22" }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function EmptySection({ text }: { text: string }) {
  return (
    <View style={styles.emptySection}>
      <Text style={styles.emptySectionText}>{text}</Text>
    </View>
  );
}

function SummaryCell({ label, value, sub, icon, tint }: any) {
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
  status,
  paidMonth,
  pastDeadline,
  onToggleAttend,
  onToggleChurras,
  onTogglePaid,
  onOpenHistory,
  onOpenPix,
  onOpenMonthly,
  onEdit,
  hasPix,
  isAdmin,
}: {
  player: Player;
  attending: boolean;
  churrasco: boolean;
  paid: boolean;
  status: PlayerStatus;
  paidMonth: boolean;
  pastDeadline: boolean;
  onToggleAttend: () => void;
  onToggleChurras: () => void;
  onTogglePaid: () => void;
  onOpenHistory: () => void;
  onOpenPix: () => void;
  onOpenMonthly: () => void;
  onEdit: () => void;
  hasPix: boolean;
  isAdmin: boolean;
}) {
  const initials = player.name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  const isMensa = player.type === "mensalista";
  const isGoleiro = player.type === "goleiro";
  const basePrice = isMensa
    ? player.monthly_fee ?? PRICES.MENSALISTA
    : isGoleiro
    ? 0
    : player.guest_fee ?? PRICES.CONVIDADO;
  const churrasPrice = player.churrasco_fee ?? PRICES.CHURRASCO;
  const hasCustom =
    player.monthly_fee != null || player.churrasco_fee != null || player.guest_fee != null;

  const waiting = status === "waiting";
  const waitingReason = waiting
    ? isMensa
      ? "Aguardando mensalidade"
      : "Aguardando pagamento"
    : "";

  return (
    <View
      style={[
        styles.card,
        status === "confirmed" && styles.cardActive,
        waiting && styles.cardWaiting,
      ]}
      testID={`player-card-${player.id}`}
    >
      <View style={styles.cardRow}>
        <Pressable onPress={onOpenHistory} testID={`open-history-${player.id}`}>
          <View style={[styles.avatar, { backgroundColor: isMensa ? colors.brandTertiary : isGoleiro ? "#FFF3E0" : "#EAF2F8" }]}>
            <Text style={[styles.avatarText, { color: isMensa ? colors.onBrandTertiary : isGoleiro ? "#8B5E3C" : "#1F5F84" }]}>
              {initials || "?"}
            </Text>
          </View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.playerName}>{player.name}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.typeBadge, { backgroundColor: isMensa ? colors.brandTertiary : isGoleiro ? "#FFF3E0" : "#EAF2F8" }]}>
              <Ionicons
                name={isMensa ? "star" : isGoleiro ? "hand-left" : "person-add"}
                size={10}
                color={isMensa ? colors.onBrandTertiary : isGoleiro ? "#8B5E3C" : "#1F5F84"}
              />
              <Text style={[styles.typeBadgeText, { color: isMensa ? colors.onBrandTertiary : isGoleiro ? "#8B5E3C" : "#1F5F84" }]}>
                {isMensa ? `Mensalista · ${brl(basePrice)}/mês` : isGoleiro ? `Goleiro · Grátis` : `Convidado · ${brl(basePrice)}`}
              </Text>
            </View>
            {hasCustom && (
              <View style={[styles.smallBadge, { backgroundColor: colors.brandSecondary }]}>
                <Ionicons name="pricetag" size={10} color={colors.onBrandSecondary} />
                <Text style={[styles.smallBadgeText, { color: colors.onBrandSecondary }]}>Personalizado</Text>
              </View>
            )}
            {isMensa && paidMonth && (
              <View style={[styles.smallBadge, { backgroundColor: "#E6F7EC" }]}>
                <Ionicons name="checkmark" size={10} color={colors.success} />
                <Text style={[styles.smallBadgeText, { color: colors.success }]}>Mês em dia</Text>
              </View>
            )}
            {isMensa && !paidMonth && pastDeadline && (
              <View style={[styles.smallBadge, { backgroundColor: "#FDEAEA" }]}>
                <Ionicons name="alert" size={10} color={colors.error} />
                <Text style={[styles.smallBadgeText, { color: colors.error }]}>Mês atrasado</Text>
              </View>
            )}
          </View>
        </View>
        {isAdmin && (
          <Pressable
            testID={`edit-player-${player.id}`}
            onPress={onEdit}
            style={styles.editBtn}
          >
            <Ionicons name="pencil" size={16} color={colors.muted} />
          </Pressable>
        )}
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

      {waiting && (
        <View style={styles.waitingBar}>
          <Ionicons name="hourglass" size={14} color="#8A6A00" />
          <Text style={styles.waitingText}>{waitingReason}</Text>
        </View>
      )}

      {attending && (
        <View style={styles.actionsRow}>
          <Pressable
            testID={`toggle-churras-${player.id}`}
            onPress={onToggleChurras}
            style={[styles.actionChip, churrasco && styles.actionChipChurrasOn]}
          >
            <Ionicons name="flame" size={16} color={churrasco ? "#fff" : "#E67E22"} />
            <Text style={[styles.actionChipText, churrasco && { color: "#fff" }]}>
              Churrasco {brl(churrasPrice)}
            </Text>
          </Pressable>
          {!isMensa && (
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
          )}
          {isMensa && (
            <Pressable
              testID={`open-monthly-from-card-${player.id}`}
              onPress={onOpenMonthly}
              style={[
                styles.actionChip,
                paidMonth && { backgroundColor: colors.success, borderColor: colors.success },
              ]}
            >
              <Ionicons name="calendar-outline" size={16} color={paidMonth ? "#fff" : colors.brand} />
              <Text style={[styles.actionChipText, paidMonth && { color: "#fff" }]}>
                {paidMonth ? "Mês pago" : "Ver mensalidade"}
              </Text>
            </Pressable>
          )}
          {hasPix && (
            <Pressable testID={`open-pix-${player.id}`} onPress={onOpenPix} style={styles.pixMiniBtn}>
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

  hero: { minHeight: 360, backgroundColor: colors.brand, overflow: "hidden" },
  heroContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: spacing.sm, gap: spacing.md },
  teamRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  teamEmoji: { fontSize: 22 },
  teamName: { color: "#fff", fontSize: 15, fontWeight: "800", flexShrink: 1 },
  scheduleRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  scheduleText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  heroKicker: { color: "rgba(255,255,255,0.85)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
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
  summaryTotal: { fontSize: 30, fontWeight: "900", color: colors.onSurface, marginTop: 2 },
  summaryHint: { fontSize: 11, color: colors.muted, marginTop: 2, marginBottom: spacing.sm },
  summaryPayRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
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
  summaryGrid: { flexDirection: "row", gap: spacing.sm },
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

  tabRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabIcon: { width: 34, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  tabTitle: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
  tabSub: { fontSize: 10, color: colors.muted, marginTop: 1 },

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

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionIcon: { width: 28, height: 28, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  sectionSubtitle: { fontSize: 11, color: colors.muted, marginTop: 1 },
  emptySection: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
  },
  emptySectionText: { color: colors.muted, fontSize: 12, textAlign: "center" },

  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardActive: { borderColor: colors.brand + "55", backgroundColor: "#F6FBF7" },
  cardWaiting: { borderColor: "#F1C40F55", backgroundColor: "#FFFDF0" },
  cardRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
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
  smallBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  smallBadgeText: { fontSize: 10, fontWeight: "800" },
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
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },

  waitingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: "#FFF4D6",
  },
  waitingText: { fontSize: 12, fontWeight: "700", color: "#8A6A00" },

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
  inviteBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  inviteBtnText: { color: colors.brand, fontWeight: "800", fontSize: 15 },
});
