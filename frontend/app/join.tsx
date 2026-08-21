import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, Invite } from "@/src/api";
import { PRICES, brl, colors, radius, spacing } from "@/src/theme";

export default function JoinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string; t?: string }>();
  const token = String(params.token || params.t || "").trim();

  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    api
      .getInvite(token)
      .then(setInvite)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    if (!invite) return;
    setError(null);
    if (!name.trim()) return setError("Digite seu nome");
    setSaving(true);
    try {
      await api.acceptInvite(invite.token, name.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace("/");
    } catch (e: any) {
      setError(e?.message || "Erro ao entrar na turma");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (notFound || !invite) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <View style={styles.errorBox} testID="invite-notfound">
          <Ionicons name="alert-circle" size={48} color={colors.error} />
          <Text style={styles.errorTitle}>Convite inválido</Text>
          <Text style={styles.errorSub}>
            Este link não existe ou já não é válido. Peça um novo link para a turma.
          </Text>
          <Pressable onPress={() => router.replace("/")} style={styles.homeBtn}>
            <Text style={styles.homeBtnText}>Ir para o app</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isMensa = invite.type === "mensalista";

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.body}>
          <View style={[styles.badge, { backgroundColor: isMensa ? colors.brandTertiary : "#EAF2F8" }]}>
            <Ionicons
              name={isMensa ? "star" : "person-add"}
              size={16}
              color={isMensa ? colors.onBrandTertiary : "#1F5F84"}
            />
            <Text style={[styles.badgeText, { color: isMensa ? colors.onBrandTertiary : "#1F5F84" }]}>
              Convite para {isMensa ? "Mensalista" : "Convidado"}
            </Text>
          </View>

          <Text style={styles.title}>Bem-vindo à turma! ⚽</Text>
          <Text style={styles.sub}>
            Toda terça, 21h. Preencha seu nome pra entrar na lista de presença.
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Como você é cobrado:</Text>
            <View style={styles.priceRow}>
              <Ionicons
                name={isMensa ? "star" : "person-add"}
                size={16}
                color={isMensa ? colors.brand : "#1F5F84"}
              />
              <Text style={styles.priceText}>
                {isMensa
                  ? `${brl(PRICES.MENSALISTA)}/mês (paga até 5º dia útil)`
                  : `${brl(PRICES.CONVIDADO)} por jogo (paga antes do jogo)`}
              </Text>
            </View>
            <View style={styles.priceRow}>
              <Ionicons name="flame" size={16} color="#E67E22" />
              <Text style={styles.priceText}>Churrasco opcional {brl(PRICES.CHURRASCO)}</Text>
            </View>
          </View>

          <Text style={styles.label}>Seu nome</Text>
          <TextInput
            testID="input-name"
            value={name}
            onChangeText={setName}
            placeholder="Ex: João Silva"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoFocus
          />
          {error && <Text style={styles.errorMsg}>{error}</Text>}

          <Pressable
            testID="submit-invite-btn"
            style={[styles.submit, saving && { opacity: 0.6 }]}
            onPress={submit}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.submitText}>Entrar na turma</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  body: { flex: 1, padding: spacing.xl, justifyContent: "center" },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  badgeText: { fontSize: 12, fontWeight: "800" },
  title: { fontSize: 26, fontWeight: "900", color: colors.onSurface },
  sub: { fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: spacing.xl },
  card: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    gap: 6,
  },
  cardLabel: { fontSize: 11, color: colors.muted, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  priceText: { fontSize: 13, color: colors.onSurface },
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
  errorMsg: { color: colors.error, marginTop: spacing.sm },
  submit: {
    marginTop: spacing.lg,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  errorBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  errorTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  errorSub: { fontSize: 14, color: colors.muted, textAlign: "center" },
  homeBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  homeBtnText: { color: "#fff", fontWeight: "800" },
});
