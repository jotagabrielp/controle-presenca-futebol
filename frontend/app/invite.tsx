import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, PlayerType } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";

const APP_URL = process.env.EXPO_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");

export default function InviteScreen() {
  const router = useRouter();
  const [type, setType] = useState<PlayerType>("convidado");
  const [generating, setGenerating] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setGenerating(true);
    setInviteUrl(null);
    try {
      const inv = await api.createInvite(type);
      const link = `${APP_URL}/join?token=${encodeURIComponent(inv.token)}`;
      setInviteUrl(link);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    if (!inviteUrl) return;
    await Clipboard.setStringAsync(inviteUrl);
    Haptics.selectionAsync().catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const shareWhatsApp = async () => {
    if (!inviteUrl) return;
    const label = type === "mensalista" ? "Mensalista" : "Convidado";
    const msg = `⚽ *Convite pra entrar na turma!*\n\nEntra na lista de presença como *${label}*:\n\n👉 ${inviteUrl}\n\n🗓️ Toda terça, 21h`;
    const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    const can = await Linking.canOpenURL(url);
    if (can) Linking.openURL(url);
    else Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable testID="back-btn" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Convidar</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="share-social" size={28} color={colors.brand} />
          </View>
          <Text style={styles.heroTitle}>Gerar link de convite</Text>
          <Text style={styles.heroSub}>
            Escolha o tipo, gere um link e envie pro seu contato. Ele vira jogador direto ao aceitar.
          </Text>
        </View>

        <Text style={styles.label}>Tipo do convite</Text>
        <View style={styles.typeRow}>
          <Pressable
            testID="type-mensalista"
            onPress={() => setType("mensalista")}
            style={[styles.typeBtn, type === "mensalista" && styles.typeBtnActive]}
          >
            <Ionicons name="star" size={20} color={type === "mensalista" ? "#fff" : colors.brand} />
            <Text style={[styles.typeText, type === "mensalista" && { color: "#fff" }]}>Mensalista</Text>
            <Text style={[styles.typeSub, type === "mensalista" && { color: "rgba(255,255,255,0.8)" }]}>
              R$60/mês
            </Text>
          </Pressable>
          <Pressable
            testID="type-convidado"
            onPress={() => setType("convidado")}
            style={[styles.typeBtn, type === "convidado" && styles.typeBtnActive]}
          >
            <Ionicons name="person-add" size={20} color={type === "convidado" ? "#fff" : colors.brand} />
            <Text style={[styles.typeText, type === "convidado" && { color: "#fff" }]}>Convidado</Text>
            <Text style={[styles.typeSub, type === "convidado" && { color: "rgba(255,255,255,0.8)" }]}>
              R$20 por jogo
            </Text>
          </Pressable>
        </View>

        {!inviteUrl ? (
          <Pressable
            testID="generate-btn"
            style={[styles.primary, generating && { opacity: 0.6 }]}
            onPress={generate}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color="#fff" />
                <Text style={styles.primaryText}>Gerar link de convite</Text>
              </>
            )}
          </Pressable>
        ) : (
          <View style={styles.result} testID="invite-result">
            <Text style={styles.resultLabel}>Link gerado ✨</Text>
            <View style={styles.linkBox}>
              <Text style={styles.linkText} numberOfLines={2}>{inviteUrl}</Text>
            </View>
            <View style={styles.buttonsRow}>
              <Pressable
                testID="copy-invite-btn"
                onPress={copy}
                style={[styles.secondary, copied && { backgroundColor: colors.success, borderColor: colors.success }]}
              >
                <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color={copied ? "#fff" : colors.brand} />
                <Text style={[styles.secondaryText, copied && { color: "#fff" }]}>
                  {copied ? "Copiado" : "Copiar"}
                </Text>
              </Pressable>
              <Pressable testID="share-invite-btn" onPress={shareWhatsApp} style={styles.whatsBtn}>
                <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                <Text style={styles.whatsText}>WhatsApp</Text>
              </Pressable>
            </View>
            <Pressable onPress={generate} style={styles.regen}>
              <Ionicons name="refresh" size={14} color={colors.muted} />
              <Text style={styles.regenText}>Gerar outro link</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
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
  body: { flex: 1, padding: spacing.lg },
  hero: { alignItems: "center", marginBottom: spacing.xl, gap: spacing.sm },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: 999,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  heroSub: { fontSize: 13, color: colors.muted, textAlign: "center", paddingHorizontal: spacing.md },
  label: { fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: spacing.sm },
  typeRow: { flexDirection: "row", gap: spacing.sm },
  typeBtn: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.brand,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    gap: 4,
  },
  typeBtnActive: { backgroundColor: colors.brand },
  typeText: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  typeSub: { fontSize: 11, color: colors.muted },
  primary: {
    marginTop: spacing.xl,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  result: { marginTop: spacing.xl, gap: spacing.md },
  resultLabel: { fontSize: 12, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 1 },
  linkBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkText: { fontSize: 12, color: colors.onSurface },
  buttonsRow: { flexDirection: "row", gap: spacing.sm },
  secondary: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  secondaryText: { color: colors.brand, fontWeight: "800" },
  whatsBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: "#25D366",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  whatsText: { color: "#fff", fontWeight: "800" },
  regen: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  regenText: { fontSize: 12, color: colors.muted, fontWeight: "600" },
});
