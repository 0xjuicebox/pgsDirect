import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from "expo-router";
import {
  Truck,
  LayoutDashboard,
  Leaf,
  ChevronRight,
} from "lucide-react-native";

const { width, height } = Dimensions.get("window");

// Refined Premium Brand Colors
const COLORS = {
  primary: "#16A34A", // Vibrant Fresh Green
  primaryDark: "#064E3B", // Deep Forest Green
  background: "#F8FAFC", // Ultra light slate
  card: "#FFFFFF",
  text: "#0F172A", // Slate 900
  textMuted: "#64748B", // Slate 500
  border: "#F1F5F9", // Slate 100
};

export default function EntryScreen() {
  const router = useRouter();

  const handleRoleSelect = (role: "driver" | "admin") => {
    if (role === "driver") {
      router.push("/auth/driver-login");
    } else {
      // Route to the new admin auth screen!
      router.push("/auth/admin-login");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      {/* Abstract Background Decoration */}
      <View style={styles.decoCircleTop} />
      <View style={styles.decoCircleBottom} />

      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.logoRing}>
            <View style={styles.logoContainer}>
              <Leaf color={COLORS.primary} size={44} strokeWidth={2.5} />
            </View>
          </View>
          <Text style={styles.title}>PGS Direct</Text>
          <Text style={styles.subtitle}>Farm fresh logistics & delivery.</Text>
        </View>

        <View style={styles.cardsContainer}>
          {/* Driver Card */}
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => handleRoleSelect("driver")}
          >
            <View style={[styles.iconBox, { backgroundColor: "#ECFDF5" }]}>
              <Truck color={COLORS.primary} size={28} strokeWidth={2.5} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Driver Portal</Text>
              <Text style={styles.cardSubtitle}>
                Routes, manifests & drop-offs
              </Text>
            </View>
            <View style={styles.chevronBox}>
              <ChevronRight color="#CBD5E1" size={24} />
            </View>
          </TouchableOpacity>

          {/* Admin Card */}
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => handleRoleSelect("admin")}
          >
            <View style={[styles.iconBox, { backgroundColor: "#F8FAFC" }]}>
              <LayoutDashboard
                color={COLORS.primaryDark}
                size={28}
                strokeWidth={2.5}
              />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Admin Dashboard</Text>
              <Text style={styles.cardSubtitle}>
                Billing, customers & live tracking
              </Text>
            </View>
            <View style={styles.chevronBox}>
              <ChevronRight color="#CBD5E1" size={24} />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  // Abstract background styling
  decoCircleTop: {
    position: "absolute",
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: width,
    backgroundColor: "#F0FDF4",
    top: -width * 0.4,
    left: -width * 0.1,
    opacity: 0.6,
  },
  decoCircleBottom: {
    position: "absolute",
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width,
    backgroundColor: "#F1F5F9",
    bottom: -width * 0.2,
    right: -width * 0.2,
    opacity: 0.5,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    zIndex: 1, // Ensures content sits above the decorative background
  },
  header: {
    alignItems: "center",
    marginBottom: 56,
  },
  logoRing: {
    padding: 8,
    borderRadius: 100,
    backgroundColor: "rgba(22, 163, 74, 0.1)",
    marginBottom: 20,
  },
  logoContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.card,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: COLORS.primaryDark,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textMuted,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  cardsContainer: {
    gap: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(241, 245, 249, 0.8)",
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 20,
    paddingRight: 8,
  },
  chevronBox: {
    justifyContent: "center",
    alignItems: "center",
  },
});
