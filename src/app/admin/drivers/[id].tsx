import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeft, Trash2, Phone, MessageCircle, Save, Sun, Moon,
  Route as RouteIcon, Power, PowerOff, Package, CheckCircle2, XCircle,
} from 'lucide-react-native';

import { api } from '../../../utils/api';
import { toLocalISODate } from '../../../utils/date';

type Driver = {
  id: string;
  name: string;
  phoneNumber: string;
  isActive: boolean;
  createdAt: string;
};

type SlotDriver = {
  slot: 'morning' | 'evening';
  driverId: string | null;
};

type RouteItem = {
  id: string;
  name: string;
  slotDrivers: SlotDriver[];
};

// A route this driver runs, and on which slot.
type Assignment = { routeId: string; routeName: string; slot: 'morning' | 'evening' };

type DeliveryLog = {
  id: string;
  customerName: string;
  slot: string;
  deliveryDate: string;
  status: string;
  routeName: string | null;
  quantities: { [key: string]: number };
};

const STATUS_STYLE: Record<string, { cls: string; label: string }> = {
  DELIVERED: { cls: 'bg-green-100 border-green-200 text-green-800', label: 'Delivered' },
  SKIPPED: { cls: 'bg-red-100 border-red-200 text-red-800', label: 'Skipped' },
  FAILED: { cls: 'bg-red-100 border-red-200 text-red-800', label: 'Failed' },
  UNATTEMPTED: { cls: 'bg-slate-100 border-slate-200 text-slate-600', label: 'Unattempted' },
  SYSTEM_AUTO_CLOSED: { cls: 'bg-slate-100 border-slate-200 text-slate-600', label: 'Auto-closed' },
};

export default function DriverDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryLog[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(true);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchDriver = useCallback(async () => {
    try {
      // Assignments aren't a dedicated endpoint — derive them by scanning
      // every route's slotDrivers for this driver's id.
      const [driverData, routesData] = await Promise.all([
        api.get(`/driver/${id}`),
        api.get('/route?page=1&limit=100').catch(() => []),
      ]);
      setDriver(driverData);
      setName(driverData.name || '');
      setPhone(driverData.phoneNumber || '');

      const found: Assignment[] = [];
      (routesData || []).forEach((rt: RouteItem) => {
        (rt.slotDrivers || []).forEach((sd) => {
          if (sd.driverId === id) {
            found.push({ routeId: rt.id, routeName: rt.name, slot: sd.slot });
          }
        });
      });
      setAssignments(found);
    } catch (err: any) {
      Alert.alert('Load Error', err.message || 'Failed to load driver');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchDeliveries = useCallback(async () => {
    setLoadingDeliveries(true);
    try {
      // Last 14 days of this driver's logs via the new driverId filter.
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 14);
      const fmt = (d: Date) => toLocalISODate(d);
      const data = await api.get(
        `/delivery?driverId=${id}&from=${fmt(from)}&to=${fmt(to)}&page=1&limit=100`,
      );
      setDeliveries(data || []);
    } catch {
      setDeliveries([]);
    } finally {
      setLoadingDeliveries(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDriver();
    fetchDeliveries();
  }, [fetchDriver, fetchDeliveries]);

  const handleSave = async () => {
    if (!driver) return;
    setSaving(true);
    try {
      await api.put(`/driver/${id}`, {
        name,
        phoneNumber: phone,
        isActive: driver.isActive,
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Driver profile updated.');
      fetchDriver();
    } catch (err: any) {
      Alert.alert('Save Error', err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!driver) return;
    const next = !driver.isActive;
    try {
      // Delete deactivates (soft delete). To reactivate, Update with isActive true.
      if (next) {
        await api.put(`/driver/${id}`, { name: driver.name, phoneNumber: driver.phoneNumber, isActive: true });
      } else {
        await api.delete(`/driver/${id}`);
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fetchDriver();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update status');
    }
  };

  if (loading || !driver) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  const morningAssignments = assignments.filter((a) => a.slot === 'morning');
  const eveningAssignments = assignments.filter((a) => a.slot === 'evening');

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
          <Pressable onPress={() => router.back()} className="w-10 h-10 bg-slate-100 rounded-full items-center justify-center active:bg-slate-200">
            <ArrowLeft size={20} color="#0F172A" />
          </Pressable>
          <Text className="text-lg font-black text-slate-900 tracking-tight" numberOfLines={1}>{driver.name}</Text>
          <View className="flex-row gap-2">
            <Pressable onPress={() => phone && Linking.openURL(`tel:${phone}`)} className="w-10 h-10 bg-slate-100 rounded-full items-center justify-center">
              <Phone size={16} color="#0F172A" />
            </Pressable>
            <Pressable onPress={() => phone && Linking.openURL(`https://wa.me/${phone.replace(/[^0-9]/g, '')}`)} className="w-10 h-10 bg-emerald-50 rounded-full items-center justify-center">
              <MessageCircle size={16} color="#16A34A" />
            </Pressable>
          </View>
        </View>

        <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
          {/* Active toggle */}
          <Pressable
            onPress={handleToggleActive}
            className={`flex-row items-center justify-between p-4 rounded-2xl border mb-6 active:opacity-90 ${driver.isActive ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-100 border-slate-200'}`}
          >
            <View className="flex-row items-center gap-2.5">
              {driver.isActive ? <Power size={18} color="#16A34A" /> : <PowerOff size={18} color="#94A3B8" />}
              <Text className={`font-bold ${driver.isActive ? 'text-emerald-800' : 'text-slate-500'}`}>
                {driver.isActive ? 'Active' : 'Inactive'}
              </Text>
            </View>
            <Text className={`text-xs font-bold ${driver.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
              Tap to {driver.isActive ? 'deactivate' : 'reactivate'}
            </Text>
          </Pressable>

          {/* Profile */}
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Profile</Text>
          <View className="bg-white rounded-[28px] p-5 border border-slate-200 mb-6 gap-4">
            <View>
              <Text className="text-xs font-bold text-slate-500 mb-1.5">Full Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-semibold text-slate-800"
              />
            </View>
            <View>
              <Text className="text-xs font-bold text-slate-500 mb-1.5">Phone Number</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-semibold text-slate-800"
              />
              <Text className="text-[11px] text-slate-400 font-medium mt-1.5 px-1">
                Changing this changes which number the driver logs in with.
              </Text>
            </View>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              className="bg-slate-900 h-12 rounded-xl items-center justify-center flex-row gap-2 active:opacity-90"
            >
              {saving ? <ActivityIndicator color="white" /> : (
                <>
                  <Save size={16} color="white" />
                  <Text className="text-white font-bold text-sm">Save Profile</Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Route assignments (read-only here — assign from the route screen) */}
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Route Assignments</Text>
          <View className="bg-white rounded-[28px] p-5 border border-slate-200 mb-6">
            {assignments.length === 0 ? (
              <View className="items-center py-4">
                <RouteIcon size={28} color="#CBD5E1" />
                <Text className="text-slate-400 font-medium text-center mt-2 text-sm">
                  Not assigned to any route yet. Assign this driver from a route's detail screen.
                </Text>
              </View>
            ) : (
              <>
                <View className="flex-row items-center gap-2 mb-2">
                  <Sun size={14} color="#D97706" />
                  <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider">Morning</Text>
                </View>
                {morningAssignments.length === 0 ? (
                  <Text className="text-slate-400 text-sm font-medium mb-3 ml-6">None</Text>
                ) : (
                  morningAssignments.map((a) => (
                    <Pressable
                      key={`m-${a.routeId}`}
                      onPress={() => router.push(`/admin/routes/${a.routeId}`)}
                      className="flex-row items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 mb-2 ml-6 active:bg-slate-100"
                    >
                      <RouteIcon size={14} color="#475569" />
                      <Text className="font-bold text-slate-700 text-sm">{a.routeName}</Text>
                    </Pressable>
                  ))
                )}

                <View className="flex-row items-center gap-2 mb-2 mt-3">
                  <Moon size={14} color="#6366F1" />
                  <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider">Evening</Text>
                </View>
                {eveningAssignments.length === 0 ? (
                  <Text className="text-slate-400 text-sm font-medium ml-6">None</Text>
                ) : (
                  eveningAssignments.map((a) => (
                    <Pressable
                      key={`e-${a.routeId}`}
                      onPress={() => router.push(`/admin/routes/${a.routeId}`)}
                      className="flex-row items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 mb-2 ml-6 active:bg-slate-100"
                    >
                      <RouteIcon size={14} color="#475569" />
                      <Text className="font-bold text-slate-700 text-sm">{a.routeName}</Text>
                    </Pressable>
                  ))
                )}
              </>
            )}
          </View>

          {/* Recent deliveries */}
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Recent Deliveries (14 days)</Text>
          <View className="bg-white rounded-[28px] p-3 border border-slate-200 mb-6">
            {loadingDeliveries ? (
              <ActivityIndicator size="small" color="#0F172A" className="py-8" />
            ) : deliveries.length === 0 ? (
              <View className="items-center py-8">
                <Package size={28} color="#CBD5E1" />
                <Text className="text-slate-400 font-medium mt-2 text-sm">No deliveries in the last 14 days.</Text>
              </View>
            ) : (
              deliveries.map((d) => {
                const meta = STATUS_STYLE[d.status] || STATUS_STYLE.UNATTEMPTED;
                const items = Object.entries(d.quantities || {}).filter(([, v]) => v > 0);
                return (
                  <View key={d.id} className="p-3 border-b border-slate-100 last:border-0">
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 pr-2">
                        <Text className="font-bold text-slate-800" numberOfLines={1}>{d.customerName}</Text>
                        <Text className="text-xs text-slate-400 font-semibold mt-0.5">
                          {d.deliveryDate} · {d.slot}
                        </Text>
                      </View>
                      <View className={`px-2 py-0.5 rounded-lg border ${meta.cls}`}>
                        <Text className={`text-[10px] font-bold uppercase ${meta.cls.split(' ')[2]}`}>{meta.label}</Text>
                      </View>
                    </View>
                    {items.length > 0 && (
                      <View className="flex-row flex-wrap gap-1.5 mt-2">
                        {items.map(([k, v]) => (
                          <View key={k} className="bg-slate-50 border border-slate-100 rounded-lg px-2 py-0.5">
                            <Text className="text-[11px] font-bold text-slate-600">
                              {v} <Text className="text-slate-400 capitalize font-semibold">{k}</Text>
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
