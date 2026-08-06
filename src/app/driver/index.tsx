import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Linking
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Phone,
  Navigation,
  Plus,
  Minus,
  X,
  Check,
  CheckCircle2,
  Package,
  Camera,
  Droplets,
  Coffee,
  Box,
  Layers,
  Circle,
  AlertCircle,
  Flag
} from 'lucide-react-native';
import { SafeAreaView } from "react-native-safe-area-context"

import { api } from '../../utils/api';
import { supabase } from '../../utils/supabase';

// --- TYPES & INTERFACES ---
type OrderData = { [key: string]: number };
type Stop = {
  id: string;
  customer: string;
  address: string;
  phone: string;
  status: 'PENDING' | 'DELIVERED' | 'SKIPPED' | 'UNATTEMPTED' | 'SYSTEM_AUTO_CLOSED';
  expectedOrder: OrderData;
  actualOrder?: OrderData;
};

const UNIT_MAP: Record<string, string> = {
  curd: 'kg', paneer: 'kg', butter: 'pkt', lassi: 'pkt', burfi: 'kg',
  ghee: 'L', bread: 'pkt', eggs: 'dz', cheese: 'pkt', yogurt: 'cup',
};

const getIconForItem = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('curd') || n.includes('yogurt') || n.includes('lassi')) return Coffee;
  if (n.includes('ghee') || n.includes('oil')) return Droplets;
  if (n.includes('paneer') || n.includes('cheese')) return Box;
  if (n.includes('butter') || n.includes('burfi') || n.includes('bread')) return Layers;
  if (n.includes('egg')) return Circle;
  return Package;
};

// ==========================================
// 🧩 SUB-COMPONENTS
// ==========================================

const CustomAlert = ({ visible, title, message, cancelText = "Cancel", confirmText = "Confirm", isDestructive = false, showCancel = true, onCancel, onConfirm }: any) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View className="flex-1 justify-center items-center bg-slate-900/40 px-5">
      <Pressable className="absolute inset-0" onPress={showCancel ? onCancel : onConfirm} />
      <View
        className="bg-white w-full max-w-sm rounded-[24px] p-6"
        style={Platform.OS === 'android' ? { elevation: 10 } : { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 15 }}
      >
        <View className="items-center mb-4">
          <View className={`w-12 h-12 rounded-full items-center justify-center mb-3 ${isDestructive ? 'bg-red-50' : 'bg-slate-50'}`}>
            <AlertCircle size={24} color={isDestructive ? '#EF4444' : '#64748B'} />
          </View>
          <Text className="text-xl font-black text-slate-800 tracking-tight text-center">{title}</Text>
        </View>
        <Text className="text-slate-500 text-sm font-medium text-center mb-6 leading-5">{message}</Text>
        <View className="flex-row gap-3">
          {showCancel && (
            <Pressable onPress={onCancel} className="flex-1 bg-slate-100 h-12 rounded-xl items-center justify-center active:bg-slate-200">
              <Text className="text-slate-700 font-bold text-base">{cancelText}</Text>
            </Pressable>
          )}
          <Pressable onPress={onConfirm} className={`flex-1 h-12 rounded-xl items-center justify-center active:opacity-80 ${isDestructive ? 'bg-red-500' : 'bg-slate-800'}`}>
            <Text className="text-white font-bold text-base">{confirmText}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);

const MilkStatCard = ({ expected, delivered }: { expected: number, delivered: number }) => (
  <View className="bg-white rounded-3xl p-5 border border-slate-200 mb-4" style={Platform.OS === 'android' ? { elevation: 3 } : { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 }}>
    <View className="flex-row items-center gap-2 mb-4">
      <Droplets size={20} color="#16A34A" />
      <Text className="text-slate-800 font-black text-sm uppercase tracking-widest">Primary Load: Milk</Text>
    </View>
    <View className="flex-row justify-between items-center">
      <View className="flex-1">
        <Text className="text-slate-500 font-semibold text-xs uppercase tracking-wider mb-1">To Load</Text>
        <View className="flex-row items-baseline">
          <Text className="text-4xl font-black text-slate-800 tracking-tighter">{expected}</Text>
          <Text className="text-xl font-bold text-slate-400 ml-1">L</Text>
        </View>
      </View>
      <View className="w-[2px] h-12 bg-slate-100 mx-4" />
      <View className="flex-1">
        <Text className="text-green-600 font-semibold text-xs uppercase tracking-wider mb-1">Delivered</Text>
        <View className="flex-row items-baseline">
          <Text className="text-4xl font-black text-green-600 tracking-tighter">{delivered}</Text>
          <Text className="text-xl font-bold text-green-400 ml-1">L</Text>
        </View>
      </View>
    </View>
  </View>
);

const SecondaryInventoryBadges = ({ items }: { items: { name: string, expected: number, delivered: number }[] }) => {
  if (items.length === 0) return null;
  return (
    <View className="mb-2">
      <Text className="text-slate-800 text-sm font-bold tracking-tight mb-2 px-1">Inventory Load</Text>
      <View className="flex-row flex-wrap justify-start">
        {items.map((item, index) => {
          const isComplete = item.delivered === item.expected && item.expected > 0;
          const Icon = getIconForItem(item.name);
          return (
            <View key={index} className="w-1/5 p-1">
              <View className={`items-center justify-center border rounded-[14px] py-2.5 px-0.5 h-full ${isComplete ? 'bg-green-50/50 border-green-200' : 'bg-white border-slate-200'}`}>
                <Icon size={20} color={isComplete ? '#15803D' : '#64748B'} strokeWidth={2.5} />
                <Text className={`text-[9px] font-bold uppercase tracking-wider mt-1.5 mb-1 text-center w-full ${isComplete ? 'text-green-700' : 'text-slate-500'}`} numberOfLines={1} adjustsFontSizeToFit>{item.name}</Text>
                <Text className={`font-black text-[12px] text-center tracking-tighter ${isComplete ? 'text-green-800' : 'text-slate-800'}`} numberOfLines={1} adjustsFontSizeToFit>{item.delivered}/{item.expected}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const ProgressBar = ({ completed, total }: { completed: number, total: number }) => {
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <View className="mt-4 mb-4 px-1">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-slate-800 text-base font-black tracking-tight">Route Progress</Text>
        <Text className="text-green-600 font-bold text-sm">{completed} / {total} Stops Done</Text>
      </View>
      <View className="h-3 bg-slate-200 rounded-full w-full overflow-hidden flex-row">
        <View className="h-full bg-green-500 rounded-full" style={{ width: `${percentage}%` }} />
      </View>
    </View>
  );
};

const ItemPill = ({ name, qty }: { name: string, qty: number }) => {
  const unit = UNIT_MAP[name.toLowerCase()] || '';
  return (
    <View className="flex-row items-center bg-slate-50 px-2.5 py-1.5 rounded-lg mr-2 mb-2 border border-slate-100">
      <Text className="text-slate-900 font-black mr-1 text-xs">{qty}{unit}</Text>
      <Text className="text-slate-500 font-semibold capitalize text-xs">{name}</Text>
    </View>
  );
};

const StopCard = ({ stop, index, onDeliver, onSkip, onCall, onNavigate }: any) => {
  const isDone = stop.status !== 'PENDING';
  const isSkipped = stop.status === 'SKIPPED' || stop.status === 'UNATTEMPTED' || stop.status === 'SYSTEM_AUTO_CLOSED';
  const displayOrder = isDone && stop.status === 'DELIVERED' ? (stop.actualOrder || {}) : stop.expectedOrder;

  return (
    <View className={`bg-white rounded-[24px] p-5 mb-4 border border-slate-100 ${isDone ? 'opacity-60 bg-slate-50/50' : ''}`} style={Platform.OS === 'android' && !isDone ? { elevation: 2 } : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 }}>
      <View className="flex-row justify-between items-start mb-3">
        <View className="flex-1 pr-2">
          <Text className="text-green-600 font-bold text-[10px] uppercase tracking-wider mb-0.5">Stop {index + 1}</Text>
          <Text className={`text-xl font-black text-slate-800 tracking-tight ${isDone ? 'line-through text-slate-400' : ''}`}>{stop.customer}</Text>
          <Text className="text-slate-400 text-sm font-medium mt-0.5">{stop.address}</Text>
        </View>
        {!isDone ? (
          <View className="flex-row gap-2">
            <Pressable onPress={() => onCall(stop.phone)} className="h-10 w-10 bg-slate-50 rounded-full items-center justify-center border border-slate-100 active:bg-slate-200">
              <Phone size={16} color="#475569" />
            </Pressable>
            <Pressable onPress={() => onNavigate(stop.address)} className="h-10 w-10 bg-slate-50 rounded-full items-center justify-center border border-slate-100 active:bg-slate-200">
              <Navigation size={16} color="#475569" />
            </Pressable>
          </View>
        ) : (
          <View>
            {isSkipped ? (
              <View className="bg-red-50 px-2.5 py-1 rounded-full border border-red-100">
                <Text className="text-red-500 font-bold text-xs">{stop.status === 'SKIPPED' ? 'Skipped' : 'Missed'}</Text>
              </View>
            ) : (
              <CheckCircle2 color="#10B981" size={28} />
            )}
          </View>
        )}
      </View>

      <View className="flex-row flex-wrap mb-4">
        {Object.entries(displayOrder).map(([item, qty]: any) => (
          <ItemPill key={item} name={item} qty={qty} />
        ))}
      </View>

      {!isDone && (
        <View className="flex-row justify-end gap-3 mt-1">
          <Pressable onPress={() => onSkip(stop)} className="h-12 w-12 bg-white border border-slate-200 rounded-full items-center justify-center active:bg-slate-100">
            <X size={20} color="#EF4444" strokeWidth={2.5} />
          </Pressable>
          <Pressable onPress={() => onDeliver(stop)} className="h-12 w-12 bg-green-500 rounded-full items-center justify-center active:opacity-85" style={Platform.OS === 'android' ? { elevation: 4 } : { shadowColor: '#22C55E', shadowOpacity: 0.3, shadowRadius: 6 }}>
            <Check size={20} color="white" strokeWidth={3} />
          </Pressable>
        </View>
      )}
    </View>
  );
};

const DeliveryModal = ({ visible, stop, editedOrder, onClose, onAdjust, onConfirm }: any) => {
  if (!stop) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-slate-900/40">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="bg-white rounded-t-[32px] p-6 pb-10" style={Platform.OS === 'android' ? { elevation: 24 } : {}}>
          <View className="w-10 h-1 bg-slate-200 rounded-full self-center mb-6" />
          <View className="flex-row justify-between items-center mb-5">
            <View>
              <Text className="text-2xl font-black text-slate-800 tracking-tight">Modify Quantities</Text>
              <Text className="text-slate-400 font-medium mt-0.5">{stop.customer}</Text>
            </View>
            <Pressable onPress={onClose} className="h-10 w-10 bg-slate-50 rounded-full items-center justify-center border border-slate-100">
              <X size={18} color="#64748B" />
            </Pressable>
          </View>
          <ScrollView className="max-h-[300px] mb-6" showsVerticalScrollIndicator={false}>
            <View className="bg-slate-50 rounded-3xl p-4 border border-slate-100 space-y-3">
              {Object.keys(stop.expectedOrder).map((itemKey) => {
                const unit = UNIT_MAP[itemKey.toLowerCase()] || '';
                const Icon = getIconForItem(itemKey);
                return (
                  <View key={itemKey} className="flex-row justify-between items-center py-2.5 border-b border-slate-100 last:border-0">
                    <View className="flex-row items-center gap-3">
                      <Icon size={20} color="#94A3B8" />
                      <Text className="text-base font-bold text-slate-700 capitalize">{itemKey}</Text>
                    </View>
                    <View className="flex-row items-center gap-3">
                      <Pressable onPress={() => onAdjust(itemKey, -1)} className="h-9 w-9 bg-white border border-slate-200 rounded-lg items-center justify-center active:bg-slate-100">
                        <Minus size={16} color="#334155" />
                      </Pressable>
                      <View className="items-center w-12">
                        <Text className="text-xl font-black text-slate-800">{editedOrder[itemKey] || 0}</Text>
                        {unit ? <Text className="text-[10px] font-bold text-slate-400 uppercase">{unit}</Text> : null}
                      </View>
                      <Pressable onPress={() => onAdjust(itemKey, 1)} className="h-9 w-9 bg-white border border-slate-200 rounded-lg items-center justify-center active:bg-slate-100">
                        <Plus size={16} color="#334155" />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
          <Pressable onPress={() => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} className="flex-row items-center justify-center bg-green-50/50 h-14 rounded-2xl border border-green-200/50 border-dashed gap-2 mb-4 active:bg-green-50">
            <Camera size={18} color="#15803D" />
            <Text className="text-green-800 font-bold text-sm">Add Delivery Proof Photo</Text>
          </Pressable>
          <Pressable onPress={onConfirm} className="bg-green-500 h-[56px] rounded-2xl items-center justify-center active:opacity-90" style={Platform.OS === 'android' ? { elevation: 3 } : { shadowColor: '#22C55E', shadowOpacity: 0.2, shadowRadius: 5 }}>
            <Text className="text-white text-base font-black tracking-wide">Confirm Delivery</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

// ==========================================
// 🚀 MAIN ORCHESTRATION CONTAINER
// ==========================================

export default function DriverManifestScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isShiftComplete, setIsShiftComplete] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  const [driverName, setDriverName] = useState("");
  const [activeRouteId, setActiveRouteId] = useState("");

  const [activeStop, setActiveStop] = useState<Stop | null>(null);
  const [deliveryModalVisible, setDeliveryModalVisible] = useState(false);
  const [editedOrder, setEditedOrder] = useState<OrderData>({});
  const [alertConfig, setAlertConfig] = useState<any>(null);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // --- 🔌 BACKEND SYNC LOGIC ---
  const fetchManifest = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const name = user?.user_metadata?.full_name || "Driver";
      setDriverName(name);

      await api.post('/driver/sync', { name });

      const todayStr = new Date().toISOString().split('T')[0];
      const manifestData = await api.get(`/driver/manifest?date=${todayStr}`);

      setActiveRouteId(manifestData.routeId);

      if (manifestData.stops && manifestData.stops.length > 0) {
        const mappedStops: Stop[] = manifestData.stops.map((backendStop: any) => {
          // Parse Expected
          const expected: OrderData = {};
          Object.entries(backendStop.deliveryOrder || {}).forEach(([key, value]) => {
            if (typeof value === 'number' && value > 0) {
              const cleanKey = key.replace('Quantity', '');
              expected[cleanKey] = value;
            }
          });

          // Parse Actual (This now correctly populates because the Go backend sends it!)
          const actual: OrderData = {};
          if (backendStop.status === 'DELIVERED') {
            Object.entries(backendStop.actualOrder || {}).forEach(([key, value]) => {
              if (typeof value === 'number' && value > 0) {
                const cleanKey = key.replace('Quantity', '');
                actual[cleanKey] = value;
              }
            });
          }

          return {
            id: backendStop.id,
            customer: backendStop.customer || backendStop.name || 'Unknown',
            address: backendStop.houseAddress || 'No Address provided',
            phone: backendStop.phoneNumber || '',
            status: backendStop.status || 'PENDING',
            expectedOrder: expected,
            actualOrder: backendStop.status === 'DELIVERED' ? actual : undefined,
          };
        });

        setStops(mappedStops);

        // Auto-lock the UI if ALL stops are processed (either delivered, skipped, or unattempted)
        const isAllComplete = mappedStops.every(s => s.status !== 'PENDING');
        if (isAllComplete && mappedStops.length > 0) {
          setIsShiftComplete(true);
        } else {
          setIsShiftComplete(false); // Make sure it unlocks if a new day starts
        }
      } else {
        setStops([]);
        setIsShiftComplete(false);
      }
    } catch (error: any) {
      if (error?.response?.status === 404 || error.message?.includes("404") || error.message?.includes("No active route")) {
        setStops([]);
        setActiveRouteId("");
      } else {
        setAlertConfig({
          title: "Network Error",
          message: "Could not connect to the backend server. Pull down to try again.",
          confirmText: "Okay",
          showCancel: false,
          onConfirm: () => setAlertConfig(null)
        });
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchManifest();
  }, [fetchManifest]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchManifest();
  }, [fetchManifest]);

  // --- 🧮 METRICS CALCULATION ---
  const totals = useMemo(() => {
    const expected: OrderData = {};
    const delivered: OrderData = {};

    stops.forEach(stop => {
      Object.entries(stop.expectedOrder).forEach(([item, qty]) => {
        expected[item] = (expected[item] || 0) + qty;
      });
      if (stop.status === 'DELIVERED' && stop.actualOrder) {
        Object.entries(stop.actualOrder).forEach(([item, qty]) => {
          delivered[item] = (delivered[item] || 0) + qty;
        });
      }
    });
    return { expected, delivered };
  }, [stops]);

  const milkExpected = totals.expected.milk || 0;
  const milkDelivered = totals.delivered.milk || 0;
  const pendingCount = stops.filter(s => s.status === 'PENDING').length;
  const completedStopsCount = stops.length - pendingCount;

  const secondaryItems = Object.keys(totals.expected)
    .filter(key => key !== 'milk')
    .map(key => ({
      name: key,
      expected: totals.expected[key] || 0,
      delivered: totals.delivered[key] || 0
    }));

  // --- 🕹️ UI HANDLERS ---
  const handleOpenDeliverySheet = (stop: Stop) => {
    setActiveStop(stop);
    setEditedOrder({ ...stop.expectedOrder });
    setDeliveryModalVisible(true);
  };

  const handleQtyAdjust = (item: string, delta: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditedOrder(prev => ({ ...prev, [item]: Math.max(0, (prev[item] || 0) + delta) }));
  };

  const submitLogToBackend = async (stopId: string, status: string, finalOrder?: OrderData) => {
    try {
      const orderPayload: any = {};
      if (finalOrder) {
        Object.entries(finalOrder).forEach(([key, value]) => {
          // THIS IS THE CRITICAL FIX: Adding the "Quantity" suffix back so Go parses it correctly
          orderPayload[`${key}Quantity`] = value;
        });
      }

      await api.post('/delivery', {
        customerId: stopId,
        routeId: activeRouteId,
        date: new Date().toISOString().split('T')[0],
        status: status,
        actualOrder: status === 'DELIVERED' ? orderPayload : undefined,
        driverLatitude: 0,
        driverLongitude: 0,
      });
    } catch (e) {
      console.error("Failed to sync log to server:", e);
      setAlertConfig({
        title: "Sync Error",
        message: "Delivery marked locally but failed to reach the server.",
        confirmText: "Okay",
        showCancel: false,
        onConfirm: () => setAlertConfig(null)
      });
    }
  };

  const handleConfirmDelivery = () => {
    if (!activeStop) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    setStops(prev => prev.map(s => s.id === activeStop.id ? { ...s, status: 'DELIVERED', actualOrder: editedOrder } : s));
    setDeliveryModalVisible(false);
    setTimeout(() => setActiveStop(null), 350);

    submitLogToBackend(activeStop.id, 'DELIVERED', editedOrder);
  };

  const handleSkipStop = (stop: Stop) => {
    setAlertConfig({
      title: "Skip Delivery?",
      message: `Are you sure you want to bypass the delivery for ${stop.customer}?`,
      confirmText: "Skip Stop",
      isDestructive: true,
      onCancel: () => setAlertConfig(null),
      onConfirm: () => {
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setStops(prev => prev.map(s => s.id === stop.id ? { ...s, status: 'SKIPPED' } : s));
        setAlertConfig(null);
        submitLogToBackend(stop.id, 'SKIPPED');
      }
    });
  };

  const handleCall = (phone: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {
      setAlertConfig({
        title: "Error",
        message: "Could not open the phone dialer.",
        confirmText: "Okay",
        showCancel: false,
        onConfirm: () => setAlertConfig(null)
      });
    });
  };

  const handleNavigate = (address: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const encodedAddress = encodeURIComponent(address);
    const url = Platform.select({
      ios: `maps:0,0?q=${encodedAddress}`,
      android: `geo:0,0?q=${encodedAddress}`,
      default: `https://maps.google.com/?q=${encodedAddress}`
    });
    Linking.openURL(url!).catch(() => {
      Linking.openURL(`https://maps.google.com/?q=${encodedAddress}`);
    });
  };

  // --- 🏁 END SHIFT LOGIC ---
  const handleEndShiftRequest = () => {
    if (pendingCount > 0) {
      setAlertConfig({
        title: "End Shift Early?",
        message: `You still have ${pendingCount} pending deliveries. Finishing now will mark these as UNATTEMPTED and alert the depot manager. Are you sure?`,
        confirmText: "End Shift",
        cancelText: "Keep Delivering",
        isDestructive: true,
        onCancel: () => setAlertConfig(null),
        onConfirm: executeEndShift
      });
    } else {
      setAlertConfig({
        title: "Complete Route",
        message: "You've marked all stops! Ready to wrap up for the day?",
        confirmText: "Yes, Finish",
        cancelText: "Wait",
        isDestructive: false,
        onCancel: () => setAlertConfig(null),
        onConfirm: executeEndShift
      });
    }
  };

  const executeEndShift = async () => {
    setAlertConfig(null);
    try {
      setIsShiftComplete(true);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await api.post('/driver/route/close', {});
    } catch (e) {
      console.error("Failed to close route on server", e);
      setIsShiftComplete(false);
      setAlertConfig({
        title: "Network Error",
        message: "Failed to close route. Check your connection and try again.",
        confirmText: "Okay",
        showCancel: false,
        onConfirm: () => setAlertConfig(null)
      });
    }
  };

  const renderHeader = () => (
    <View className="px-5 pt-4 pb-2">
      <Text className="text-3xl font-black text-slate-800 tracking-tighter">Hi {driverName}</Text>
      <Text className="text-sm font-semibold text-slate-400 mb-6">{today}</Text>

      {stops.length > 0 && (
        <>
          <MilkStatCard expected={milkExpected} delivered={milkDelivered} />
          <SecondaryInventoryBadges items={secondaryItems} />
          <ProgressBar completed={completedStopsCount} total={stops.length} />
        </>
      )}
    </View>
  );

  const renderFooter = () => {
    if (stops.length === 0) return null;
    return (
      <View className="px-5 mt-6 mb-12">
        <Pressable onPress={handleEndShiftRequest} className="bg-slate-800 h-[56px] rounded-2xl items-center justify-center active:opacity-90 flex-row gap-2">
          <Flag size={20} color="white" />
          <Text className="text-white text-base font-black tracking-wide">Finish Route & Return</Text>
        </Pressable>
      </View>
    );
  };

  if (isShiftComplete) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center px-6">
        <View className="w-24 h-24 bg-green-100 rounded-full items-center justify-center mb-6">
          <CheckCircle2 size={48} color="#16A34A" />
        </View>
        <Text className="text-3xl font-black text-slate-800 tracking-tighter text-center">Shift Complete</Text>
        <Text className="text-slate-500 font-medium mt-3 text-center text-base leading-6">
          You've successfully closed your route for {today}. Have a great rest of your day!
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator size="large" color="#16A34A" />
        <Text className="text-slate-500 font-semibold mt-4 tracking-wide">Syncing your route...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1">
        <FlatList
          data={stops}
          keyExtractor={(item: any) => item.id}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#16A34A" colors={['#16A34A']} />}
          renderItem={({ item, index }: any) => (
            <View className="px-5">
              <StopCard stop={item} index={index} onDeliver={handleOpenDeliverySheet} onSkip={handleSkipStop} onCall={handleCall} onNavigate={handleNavigate} />
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="items-center justify-center mt-10">
              <Package size={48} color="#CBD5E1" />
              <Text className="text-slate-700 font-bold text-base mt-4">No Route Assigned</Text>
              <Text className="text-slate-400 font-medium text-center px-8 mt-2">
                You have no active deliveries for today. Pull down to refresh if you were just assigned a route.
              </Text>
            </View>
          }
        />

        <DeliveryModal visible={deliveryModalVisible} stop={activeStop} editedOrder={editedOrder} onClose={() => setDeliveryModalVisible(false)} onAdjust={handleQtyAdjust} onConfirm={handleConfirmDelivery} />
        {alertConfig && <CustomAlert visible={!!alertConfig} title={alertConfig.title} message={alertConfig.message} confirmText={alertConfig.confirmText} cancelText={alertConfig.cancelText} isDestructive={alertConfig.isDestructive} showCancel={alertConfig.showCancel !== false} onCancel={alertConfig.onCancel} onConfirm={alertConfig.onConfirm} />}
      </SafeAreaView>
    </View>
  );
}
