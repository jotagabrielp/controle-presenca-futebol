import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
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

import { api, PlayerType } from "@/src/api";
import { PRICES, brl, colors, radius, spacing } from "@/src/theme";

export default function AddPlayer() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<PlayerType>("mensalista");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setError("Digite o nome do jogador");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createPlayer(name.trim(), type);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <Pressable testID="close-btn" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.title}>Novo Jogador</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.body}>
          <Text style={styles.label}>Nome do jogador</Text>
          <TextInput
            testID="input-name"
            value={name}
            onChangeText={(t) => {
              setName(t);
              if (error) setError(null);
            }}
            placeholder="Ex: João Silva"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={save}
          />
          {error && <Text style={styles.error}>{error}</Text>}

          <Text style={[styles.label, { marginTop: spacing.xl }]}>Tipo</Text>
          <View style={styles.typeRow}>
            <TypeCard
              testID="type-mensalista"
              active={type === "mensalista"}
              icon="star"
              title="Mensalista"
              price={brl(PRICES.MENSALISTA)}
              onPress={() => setType("mensalista")}
              tint={colors.brand}
            />
            <TypeCard
              testID="type-convidado"
              active={type === "convidado"}
              icon="person-add"
              title="Convidado"
              price={brl(PRICES.CONVIDADO)}
              onPress={() => setType("convidado")}
              tint="#1F5F84"
            />
            <TypeCard
              testID="type-goleiro"
              active={type === "goleiro"}
              icon="hand-left"
              title="Goleiro"
              price="Grátis"
              onPress={() => setType("goleiro")}
              tint="#8B5E3C"
            />
          </View>
        </View>

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

function TypeCard({
  active,
  icon,
  title,
  price,
  onPress,
  tint,
  testID,
}: {
  active: boolean;
  icon: any;
  title: string;
  price: string;
  onPress: () => void;
  tint: string;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.typeCard, active && { borderColor: tint, backgroundColor: tint + "10" }]}
    >
      <View style={[styles.typeIcon, { backgroundColor: tint + "22" }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <Text style={styles.typeTitle}>{title}</Text>
      <Text style={[styles.typePrice, { color: tint }]}>{price}</Text>
      {active && (
        <View style={[styles.checkDot, { backgroundColor: tint }]}>
          <Ionicons name="checkmark" size={12} color="#fff" />
        </View>
      )}
    </Pressable>
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
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  label: { fontSize: 13, fontWeight: "700", color: colors.muted, marginBottom: spacing.sm },
  input: {
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.onSurface,
  },
  error: { color: colors.error, marginTop: spacing.xs, fontSize: 12 },
  typeRow: { flexDirection: "row", gap: spacing.md },
  typeCard: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "flex-start",
    gap: 6,
    position: "relative",
  },
  typeIcon: { width: 42, height: 42, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  typeTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface, marginTop: 4 },
  typePrice: { fontSize: 18, fontWeight: "900" },
  checkDot: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: { padding: spacing.lg },
  saveBtn: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
