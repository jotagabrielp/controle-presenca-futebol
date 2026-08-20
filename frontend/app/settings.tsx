import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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

import { api } from "@/src/api";
import { PRICES, brl, colors, radius, spacing } from "@/src/theme";

export default function Settings() {
  const router = useRouter();
  const [pixKey, setPixKey] = useState("");
  const [holder, setHolder] = useState("");
  const [bank, setBank] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getPix().then((p) => {
      setPixKey(p.pix_key);
      setHolder(p.holder_name);
      setBank(p.bank);
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.updatePix({ pix_key: pixKey.trim(), holder_name: holder.trim(), bank: bank.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
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

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable testID="back-btn" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Configurações</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.sectionKicker}>Chave Pix da turma</Text>
          <Text style={styles.sectionSub}>
            Todos verão essa chave ao pagar sua mensalidade, convite ou churrasco.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Chave Pix</Text>
            <TextInput
              testID="input-pix-key"
              value={pixKey}
              onChangeText={setPixKey}
              placeholder="CPF, e-mail, telefone ou chave aleatória"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Nome do titular</Text>
            <TextInput
              testID="input-holder"
              value={holder}
              onChangeText={setHolder}
              placeholder="Ex: João Silva"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Banco (opcional)</Text>
            <TextInput
              testID="input-bank"
              value={bank}
              onChangeText={setBank}
              placeholder="Ex: Nubank"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </View>

          <View style={styles.priceCard}>
            <Text style={styles.sectionKicker}>Valores fixos</Text>
            <PriceRow icon="star" tint={colors.brand} label="Mensalista" value={brl(PRICES.MENSALISTA)} />
            <PriceRow icon="person-add" tint="#1F5F84" label="Convidado" value={brl(PRICES.CONVIDADO)} />
            <PriceRow icon="flame" tint="#E67E22" label="Churrasco por pessoa" value={brl(PRICES.CHURRASCO)} />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            testID="save-pix-btn"
            style={[styles.saveBtn, saved && { backgroundColor: colors.success }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name={saved ? "checkmark" : "save-outline"} size={20} color="#fff" />
                <Text style={styles.saveText}>{saved ? "Salvo!" : "Salvar"}</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PriceRow({ icon, tint, label, value }: any) {
  return (
    <View style={styles.priceRow}>
      <View style={[styles.priceIcon, { backgroundColor: tint + "22" }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={styles.priceLabel}>{label}</Text>
      <Text style={styles.priceValue}>{value}</Text>
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
  body: { padding: spacing.lg, gap: spacing.md },
  sectionKicker: { fontSize: 12, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 1 },
  sectionSub: { color: colors.muted, fontSize: 13, marginBottom: spacing.sm },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
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
  priceCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  priceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  priceIcon: { width: 30, height: 30, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  priceLabel: { flex: 1, color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  priceValue: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
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
