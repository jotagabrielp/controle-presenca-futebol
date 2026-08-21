import { storage } from "./storage";

const TOKEN_KEY = "futlista.admin_token";
const EMAIL_KEY = "futlista.admin_email";

export const authStore = {
  async getToken(): Promise<string | null> {
    return await storage.secureGet<string>(TOKEN_KEY, "");
  },
  async setSession(token: string, email: string) {
    await storage.secureSet(TOKEN_KEY, token);
    await storage.secureSet(EMAIL_KEY, email);
  },
  async getEmail(): Promise<string | null> {
    return await storage.secureGet<string>(EMAIL_KEY, "");
  },
  async clear() {
    await storage.secureRemove(TOKEN_KEY);
    await storage.secureRemove(EMAIL_KEY);
  },
};
