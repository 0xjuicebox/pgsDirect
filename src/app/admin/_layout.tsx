import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Platform, Dimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { LayoutDashboard, UserCheck, Route as RouteIcon, Truck, Receipt } from 'lucide-react-native';

const { width } = Dimensions.get('window');

const COLORS = {
  active: '#0F172A',
  inactive: '#94A3B8',
  background: '#FFFFFF',
  shadow: '#000000',
};

const AnimatedTabIcon = ({ focused, IconComponent, label }: any) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const labelOpacity = useRef(new Animated.Value(0)).current;
  const indicatorScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (focused) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -6, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(labelOpacity, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
        Animated.spring(indicatorScale, { toValue: 1, tension: 140, friction: 12, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(labelOpacity, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(indicatorScale, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
    }
  }, [focused]);

  return (
    <View style={styles.tabContainer}>
      <Animated.View style={{ transform: [{ translateY }], alignItems: 'center' }}>
        <IconComponent color={focused ? COLORS.active : COLORS.inactive} size={22} strokeWidth={focused ? 2.5 : 2} />
        <Animated.View style={[styles.activeDot, { transform: [{ scale: indicatorScale }], opacity: indicatorScale }]} />
      </Animated.View>
      <Animated.Text style={[styles.customLabel, { opacity: labelOpacity }]}>{label}</Animated.Text>
    </View>
  );
};

export default function AdminTabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.floatingDock,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: (props) => <AnimatedTabIcon {...props} IconComponent={LayoutDashboard} label="Live" />,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Customers',
          tabBarIcon: (props) => <AnimatedTabIcon {...props} IconComponent={UserCheck} label="Customers" />,
        }}
      />
      <Tabs.Screen
        name="routes"
        options={{
          title: 'Routes',
          tabBarIcon: (props) => <AnimatedTabIcon {...props} IconComponent={RouteIcon} label="Routes" />,
        }}
      />
      <Tabs.Screen
        name="drivers"
        options={{
          title: 'Drivers',
          tabBarIcon: (props) => <AnimatedTabIcon {...props} IconComponent={Truck} label="Drivers" />,
        }}
      />
      <Tabs.Screen
        name="billing"
        options={{
          title: 'Billing',
          tabBarIcon: (props) => <AnimatedTabIcon {...props} IconComponent={Receipt} label="Billing" />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  floatingDock: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 28 : 16,
    left: width * 0.04,
    right: width * 0.04,
    backgroundColor: COLORS.background,
    borderRadius: 36,
    height: 68,
    borderTopWidth: 0,
    paddingHorizontal: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  tabContainer: {
    width: 54,
    height: '100%',
    paddingTop: Platform.OS === 'ios' ? 18 : 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customLabel: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? -6 : 8,
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.active,
    letterSpacing: 0.2,
  },
  activeDot: {
    position: 'absolute',
    bottom: -8,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.active,
  },
});
