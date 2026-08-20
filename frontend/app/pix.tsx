import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, PixSettings } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";

export default function PixScreen() {
  const router = useRouter();
  const [pix, setPix] = useState<PixSettings | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getPix().then(setPix).catch(() => setPix({ pix_key: "", holder_name: "", bank: "" }));
  }, []);

  const copy = async () => {
    if (!pix?.pix_key) return;
    await Clipboard.setStringAsync(pix.pix_key);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!pix) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const hasPix = !!pix.pix_key;

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable testID="back-btn" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Pagamento Pix</Text>
        <Pressable testID="edit-pix-btn" onPress={() => router.push("/settings")} style={styles.iconBtn}>
          <Ionicons name="create-outline" size={20} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {!hasPix ? (
          <View style={styles.emptyCard} testID="pix-empty">
            <Ionicons name="qr-code-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyTitle}>Chave Pix não cadastrada</Text>
            <Text style={styles.emptySub}>
              Configure uma chave Pix nas configurações para que todos possam pagar.
            </Text>
            <Pressable
              testID="go-settings"
              onPress={() => router.push("/settings")}
              style={styles.primaryBtn}
            >
              <Ionicons name="settings-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Configurar Pix</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.qrCard} testID="pix-qr">
              <View style={styles.qrWrap}>
                <QRCode
                  value={pix.pix_key}
                  size={200}
                  color={colors.onSurface}
                  backgroundColor="#fff"
                />
              </View>
              <Text style={styles.qrCaption}>Escaneie o QR code para pagar</Text>
            </View>

            <View style={styles.keyCard}>
              <Text style={styles.keyLabel}>Chave Pix</Text>
              <Text style={styles.keyValue} numberOfLines={2} testID="pix-key-value">{pix.pix_key}</Text>
              <Pressable
                testID="copy-pix-btn"
                onPress={copy}
                style={[styles.copyBtn, copied && { backgroundColor: colors.success }]}
              >
                <Ionicons name={copied ? "checkmark" : "copy-outline"} size={18} color="#fff" />
                <Text style={styles.copyBtnText}>{copied ? "Copiado!" : "Copiar chave Pix"}</Text>
              </Pressable>
            </View>

            {(pix.holder_name || pix.bank) && (
              <View style={styles.holderCard}>
                {pix.holder_name ? (
                  <View style={styles.holderRow}>
                    <Ionicons name="person-outline" size={16} color={colors.muted} />
                    <Text style={styles.holderText}>{pix.holder_name}</Text>
                  </View>
                ) : null}
                {pix.bank ? (
                  <View style={styles.holderRow}>
                    <Ionicons name="business-outline" size={16} color={colors.muted} />
                    <Text style={styles.holderText}>{pix.bank}</Text>
                  </View>
                ) : null}
              </View>
            )}

            <View style={styles.tipBox}>
              <Ionicons name="information-circle" size={18} color={colors.brand} />
              <Text style={styles.tipText}>
                Após pagar, volte na lista e marque &quot;Pago&quot; no seu card.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
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
  body: { padding: spacing.lg, gap: spacing.md },
  qrCard: {
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.xl,
    borderRadius: radius.lg,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 2,
  },
  qrWrap: {
    padding: spacing.md,
    backgroundColor: "#fff",
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.brandTertiary,
  },
  qrCaption: { color: colors.muted, marginTop: spacing.md, fontSize: 13 },
  keyCard: {
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  keyLabel: { fontSize: 12, color: colors.muted, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  keyValue: { fontSize: 16, color: colors.onSurface, fontWeight: "700", marginTop: 6, marginBottom: spacing.md },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  copyBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  holderCard: {
    backgroundColor: colors.surfaceTertiary,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: 6,
  },
  holderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  holderText: { color: colors.onSurface, fontSize: 14 },
  tipBox: {
    flexDirection: "row",
    gap: 8,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "flex-start",
  },
  tipText: { flex: 1, color: colors.onBrandTertiary, fontSize: 13, lineHeight: 18 },
  emptyCard: {
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
  emptySub: { color: colors.muted, textAlign: "center", fontSize: 13 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    marginTop: spacing.md,
  },
  primaryBtnText: { color: "#fff", fontWeight: "800" },
});
