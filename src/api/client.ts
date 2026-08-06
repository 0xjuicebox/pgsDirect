import axios from "axios";
import { Platform } from "react-native";

// When running on an Android emulator, localhost is 10.0.2.2
// If testing on a physical device, change this to your computer's local IP (e.g., 192.168.1.100)
const DEV_URL =
  Platform.OS === "android"
    ? "http://10.0.2.2:8080/api/v1"
    : "http://localhost:3000";

export const apiClient = axios.create({
  baseURL: DEV_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// We can add interceptors here later to automatically inject JWT tokens!
apiClient.interceptors.request.use(
  (config) => {
    // console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => Promise.reject(error),
);
