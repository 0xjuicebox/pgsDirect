import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { ClipboardList, History, User } from 'lucide-react-native';

const COLORS = {
  primary: '#16A34A',        // Vibrant Green
  primaryLight: '#DCFCE7',   // Very soft green background for active icon
  background: '#FFFFFF',
  textMuted: '#94A3B8',
  border: '#F1F5F9',
  shadow: '#0F172A',
};

// 1. The Custom Animated Icon Component
const AnimatedTabIcon = ({ focused, IconComponent, color, size, label }: any) => {
  // Animation Values
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (focused) {
      // Spring up and scale when active
      Animated.parallel([
        Animated.spring(scale, { toValue: 1.1, tension: 100, friction: 4, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: -4, tension: 100, friction: 4, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true })
      ]).start();
    } else {
      // Return to normal when inactive
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, tension: 100, friction: 5, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, tension: 100, friction: 5, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true })
      ]).start();
    }
  }, [focused]);

  return (
    <Animated.View style={[styles.iconContainer, { transform: [{ scale }, { translateY }] }]}>
      {/* Soft glowing background behind the active icon */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.activeBackground, { opacity }]} />
      <IconComponent color={color} size={size} strokeWidth={focused ? 2.5 : 2} />
    </Animated.View>
  );
};

// 2. The Main Layout Config
export default function DriverTabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.floatingTabBar,
        // Remove standard click ripple on Android for a cleaner custom feel
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Manifest',
          tabBarIcon: (props) => <AnimatedTabIcon {...props} IconComponent={ClipboardList} label="Manifest" />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: (props) => <AnimatedTabIcon {...props} IconComponent={History} label="History" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: (props) => <AnimatedTabIcon {...props} IconComponent={User} label="Profile" />,
        }}
      />
    </Tabs>
  );
}

// 3. Premium Styling
const styles = StyleSheet.create({
  floatingTabBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 24 : 16,
    left: 20,
    right: 20,
    backgroundColor: COLORS.background,
    borderRadius: 30,
    height: 70,
    borderTopWidth: 0, // Removes default border
    paddingBottom: Platform.OS === 'ios' ? 20 : 0, // Fixes iOS safe area push

    // Premium Drop Shadow
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  tabItem: {
    paddingTop: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
  },
  activeBackground: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 22,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: -4,
  },
});
