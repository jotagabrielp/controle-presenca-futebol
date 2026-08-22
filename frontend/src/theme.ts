export const colors = {
  surface: "#FDFBF7",
  onSurface: "#1A1D1A",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1A1D1A",
  surfaceTertiary: "#F0F3EF",
  onSurfaceTertiary: "#2E4032",
  surfaceInverse: "#232B25",
  onSurfaceInverse: "#FDFBF7",
  brand: "#1E8449",
  brandPrimary: "#1E8449",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#F4D03F",
  onBrandSecondary: "#1A1D1A",
  brandTertiary: "#E9F2EC",
  onBrandTertiary: "#12512D",
  success: "#27AE60",
  onSuccess: "#FFFFFF",
  warning: "#F1C40F",
  onWarning: "#1A1D1A",
  error: "#D32F2F",
  onError: "#FFFFFF",
  border: "#E0E5E2",
  borderStrong: "#C8D1CC",
  divider: "#E0E5E2",
  muted: "#6B7A6E",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export const PRICES = {
  MENSALISTA: 60,
  CONVIDADO: 20,
  CHURRASCO: 20,
  GOLEIRO: 0,
};

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export const brl = (n: number) =>
  `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;
