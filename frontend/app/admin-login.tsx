import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
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

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { colors, radius, spacing } from "@/src/theme";

export default function AdminLogin() {
  const router = useRouter();
  const { login, setup } = useAuth();
  const [mode, setMode] = useState<"login" | "setup">("login");
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .authSetupRequired()
      .then((r) => setMode(r.setup_required ? "setup" : "login"))
      .finally(() => setChecking(false));
  }, []);

  const submit = async () => {
    setError(null);
    if (!email.trim() || password.length < 6) {
      setError("Preencha e-mail e senha (mínimo 6 caracteres)");
      return;
    }
    setLoading(true);
    try {
      if (mode === "setup") await setup(email.trim(), password);
      else await login(email.trim(), password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace("/");
    } catch (e: any) {
      setError(e?.message || "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
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
          <Text style={styles.title}>Admin</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.body}>
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name="shield-checkmark" size={32} color={colors.brand} />
            </View>
            <Text style={styles.heroTitle}>
              {mode === "setup" ? "Criar admin da turma" : "Entrar como admin"}
            </Text>
            <Text style={styles.heroSub}>
              {mode === "setup"
                ? "Você será o primeiro admin. Só admins editam valores, mensalidades e despesas."
                : "Entre com seu e-mail e senha de admin."}
            </Text>
          </View>

          <Text style={styles.label}>E-mail</Text>
          <TextInput
            testID="input-email"
            value={email}
            onChangeText={setEmail}
            placeholder="admin@turma.com"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Text style={[styles.label, { marginTop: spacing.md }]}>Senha</Text>
          <TextInput
            testID="input-password"
            value={password}
            onChangeText={setPassword}
            placeholder="Mínimo 6 caracteres"
            placeholderTextColor={colors.muted}
            style={styles.input}
            secureTextEntry
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            testID="submit-btn"
            style={[styles.submit, loading && { opacity: 0.6 }]}
            onPress={submit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name={mode === "setup" ? "person-add" : "log-in"} size={18} color="#fff" />
                <Text style={styles.submitText}>{mode === "setup" ? "Criar admin" : "Entrar"}</Text>
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
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  heroSub: { fontSize: 13, color: colors.muted, textAlign: "center", paddingHorizontal: spacing.lg },
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
  error: { color: colors.error, marginTop: spacing.md, textAlign: "center" },
  submit: {
    marginTop: spacing.xl,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
