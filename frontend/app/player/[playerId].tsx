import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, Player, PlayerType } from "@/src/api";
import { PRICES, brl, colors, radius, spacing } from "@/src/theme";

export default function EditPlayer() {
  const router = useRouter();
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<PlayerType>("mensalista");
  const [monthlyOverride, setMonthlyOverride] = useState(false);
  const [monthlyFee, setMonthlyFee] = useState("");
  const [guestOverride, setGuestOverride] = useState(false);
  const [guestFee, setGuestFee] = useState("");
  const [churrasOverride, setChurrasOverride] = useState(false);
  const [churrasFee, setChurrasFee] = useState("");

  useEffect(() => {
    (async () => {
      if (!playerId) return;
      const all = await api.listPlayers();
      const p = all.find((x) => x.id === playerId);
      if (p) {
        setPlayer(p);
        setName(p.name);
        setType(p.type);
        if (p.monthly_fee != null) {
          setMonthlyOverride(true);
          setMonthlyFee(String(p.monthly_fee));
        }
        if (p.guest_fee != null) {
          setGuestOverride(true);
          setGuestFee(String(p.guest_fee));
        }
        if (p.churrasco_fee != null) {
          setChurrasOverride(true);
          setChurrasFee(String(p.churrasco_fee));
        }
      }
      setLoading(false);
    })();
  }, [playerId]);

  const parseNum = (s: string) => parseFloat(s.replace(",", "."));

  const save = async () => {
    if (!player) return;
    setError(null);
    if (!name.trim()) {
      setError("Nome obrigatório");
      return;
    }
    const patch: any = { name: name.trim(), type };
    if (monthlyOverride) {
      const v = parseNum(monthlyFee);
      if (isNaN(v) || v < 0) return setError("Valor da mensalidade inválido");
      patch.monthly_fee = v;
    } else {
      patch.clear_monthly_fee = true;
    }
    if (guestOverride) {
      const v = parseNum(guestFee);
      if (isNaN(v) || v < 0) return setError("Valor do convite inválido");
      patch.guest_fee = v;
    } else {
      patch.clear_guest_fee = true;
    }
    if (churrasOverride) {
      const v = parseNum(churrasFee);
      if (isNaN(v) || v < 0) return setError("Valor do churrasco inválido");
      patch.churrasco_fee = v;
    } else {
      patch.clear_churrasco_fee = true;
    }
    setSaving(true);
    try {
      await api.updatePlayer(player.id, patch);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!player) return;
    const doDelete = async () => {
      await api.deletePlayer(player.id);
      router.back();
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Excluir ${player.name}?`)) doDelete();
      return;
    }
    Alert.alert("Excluir jogador", `Excluir ${player.name}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: doDelete },
    ]);
  };

  if (loading || !player) {
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
          <Text style={styles.title}>Editar jogador</Text>
          <Pressable testID="delete-btn" onPress={remove} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.label}>Nome</Text>
          <TextInput
            testID="input-name"
            value={name}
            onChangeText={setName}
            placeholder="Nome do jogador"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <Text style={[styles.label, { marginTop: spacing.lg }]}>Tipo</Text>
          <View style={styles.typeRow}>
            <Pressable
              testID="type-mensalista"
              onPress={() => setType("mensalista")}
              style={[styles.typeBtn, type === "mensalista" && styles.typeBtnActive]}
            >
              <Ionicons name="star" size={16} color={type === "mensalista" ? "#fff" : colors.brand} />
              <Text style={[styles.typeBtnText, type === "mensalista" && { color: "#fff" }]}>
                Mensalista
              </Text>
            </Pressable>
            <Pressable
              testID="type-convidado"
              onPress={() => setType("convidado")}
              style={[styles.typeBtn, type === "convidado" && styles.typeBtnActive]}
            >
              <Ionicons name="person-add" size={16} color={type === "convidado" ? "#fff" : colors.brand} />
              <Text style={[styles.typeBtnText, type === "convidado" && { color: "#fff" }]}>
                Convidado
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.sectionKicker, { marginTop: spacing.xl }]}>Valores personalizados</Text>
          <Text style={styles.sectionSub}>
            Deixe padrão pra usar os valores da turma, ou defina um valor específico (útil para quem trabalha 15x15 e paga diferente).
          </Text>

          {type === "mensalista" && (
            <FeeField
              testID="fee-monthly"
              label="Mensalidade"
              icon="star"
              tint={colors.brand}
              defaultLabel={`Padrão: ${brl(PRICES.MENSALISTA)}/mês`}
              enabled={monthlyOverride}
              setEnabled={setMonthlyOverride}
              value={monthlyFee}
              setValue={setMonthlyFee}
              placeholder="Ex: 30 (metade por trabalhar 15x15)"
            />
          )}

          {type === "convidado" && (
            <FeeField
              testID="fee-guest"
              label="Valor por jogo (convite)"
              icon="person-add"
              tint="#1F5F84"
              defaultLabel={`Padrão: ${brl(PRICES.CONVIDADO)}/jogo`}
              enabled={guestOverride}
              setEnabled={setGuestOverride}
              value={guestFee}
              setValue={setGuestFee}
              placeholder="Ex: 15"
            />
          )}

          <FeeField
            testID="fee-churras"
            label="Churrasco"
            icon="flame"
            tint="#E67E22"
            defaultLabel={`Padrão: ${brl(PRICES.CHURRASCO)}/pessoa`}
            enabled={churrasOverride}
            setEnabled={setChurrasOverride}
            value={churrasFee}
            setValue={setChurrasFee}
            placeholder="Ex: 25"
          />

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            testID="save-btn"
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.saveText}>Salvar</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FeeField({
  label,
  icon,
  tint,
  defaultLabel,
  enabled,
  setEnabled,
  value,
  setValue,
  placeholder,
  testID,
}: any) {
  return (
    <View style={styles.feeCard}>
      <View style={styles.feeRow}>
        <View style={[styles.feeIcon, { backgroundColor: tint + "22" }]}>
          <Ionicons name={icon} size={16} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.feeLabel}>{label}</Text>
          <Text style={styles.feeSub}>{enabled ? "Valor personalizado" : defaultLabel}</Text>
        </View>
        <Pressable
          testID={`${testID}-toggle`}
          onPress={() => setEnabled(!enabled)}
          style={[styles.switch, enabled && { backgroundColor: colors.brand }]}
        >
          <View style={[styles.switchDot, enabled && { transform: [{ translateX: 20 }] }]} />
        </Pressable>
      </View>
      {enabled && (
        <TextInput
          testID={`${testID}-input`}
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          style={styles.feeInput}
        />
      )}
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
  body: { padding: spacing.lg, paddingBottom: 100 },
  label: { fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 6 },
  input: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.onSurface,
  },
  typeRow: { flexDirection: "row", gap: spacing.sm },
  typeBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.brand,
    backgroundColor: colors.surfaceSecondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  typeBtnActive: { backgroundColor: colors.brand },
  typeBtnText: { color: colors.brand, fontWeight: "800" },
  sectionKicker: { fontSize: 12, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 1 },
  sectionSub: { color: colors.muted, fontSize: 12, marginTop: 4, marginBottom: spacing.md },
  feeCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  feeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  feeIcon: { width: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  feeLabel: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  feeSub: { fontSize: 11, color: colors.muted, marginTop: 1 },
  switch: {
    width: 44,
    height: 24,
    borderRadius: 999,
    backgroundColor: colors.borderStrong,
    padding: 2,
    justifyContent: "center",
  },
  switchDot: { width: 20, height: 20, borderRadius: 999, backgroundColor: "#fff" },
  feeInput: {
    marginTop: spacing.sm,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.onSurface,
  },
  error: { color: colors.error, marginTop: spacing.md },
  footer: { padding: spacing.lg },
  saveBtn: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
