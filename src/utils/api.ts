import { supabase } from "./supabase";
import { Platform } from "react-native";

// ⚠️ THE LOCALHOST TRAP:
// If you are testing on a physical phone, 'localhost' will NOT work because the phone
// is looking at its own internal network, not your laptop!
// Replace the IP below with your computer's actual local Wi-Fi IP address (e.g., 192.168.1.15)
const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (Platform.OS === "web"
    ? "http://localhost:3000"
    : "http://192.168.29.84:3000");

export const api = {
  async request(endpoint: string, options: RequestInit = {}) {
    // 1. Grab the active session directly from Supabase
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // 2. Build headers, securely attaching the JWT
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    // 3. Make the fetch call to your Go backend
    const response = await fetch(`${BACKEND_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const text = await response.text();
    let data: any = {};

    // 🚀 Safe parsing: Catch plain-text errors like "404 page not found"
    // so it doesn't crash the JS parser before throwing the error.
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      // If it's not valid JSON, treat the raw text as the error message
      data = { message: text };
    }

    if (!response.ok) {
      throw new Error(
        data.error || data.message || `API Error: ${response.status}`,
      );
    }

    return data;
  },

  get(endpoint: string) {
    return this.request(endpoint, { method: "GET" });
  },

  post(endpoint: string, body: any) {
    return this.request(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  put(endpoint: string, body: any) {
    return this.request(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  delete(endpoint: string) {
    return this.request(endpoint, { method: "DELETE" });
  },
};
