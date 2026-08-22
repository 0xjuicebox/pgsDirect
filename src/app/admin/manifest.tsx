import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Linking,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Phone,
  MapPin,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Truck,
  PackageX,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { api } from '../../utils/api';

// The manifest answers the question the roster can't: what is the driver
// actually delivering, right now, on this route?
//
// The roster is who is assigned to a route. The manifest is who is DUE today
// — after schedules (daily / alternate / custom), after one-off overrides,
// after pauses — with the quantities that apply on this specific date. Those
// are different lists, and when a driver says "my list looks wrong", this is
// the one to look at.
//
// Read-only by design. Everything here is derived live from subscriptions,
// overrides and delivery logs; editing belongs on those records, not on a
// view of them.

type Order = Record<string, number>;

type Stop = {
  id: string;
  customer: string;
  phoneNumber: string;
  houseAddress: string;
  geoLatitude: string;
  geoLongitude: string;
  isActive: boolean;
  stopOrder: number;
  deliveryOrder: Order;   // what the driver was asked to deliver
  status: string | null;  // null = not yet attempted
  actualOrder: Order;     // what was actually recorded
};

type Manifest = {
  routeId: string;
  routeName: string;
  slot: 'morning' | 'evening';
  driverName: string | null;
  driverPhone: string | null;
  targetDate: string;
  stops: Stop[];
};

type Route = { id: string; name: string };

const LABELS: Record<string, string> = {
  milkQuantity: 'Milk', curdQuantity: 'Curd', butterQuantity: 'Butter',
  gheeQuantity: 'Ghee', lassiQuantity: 'Buttermilk', paneerQuantity: 'Paneer',
  jaggeryQuantity: 'Jaggery', khandQuantity: 'Desi Khand', oilQuantity: 'Mustard Oil',
  attaQuantity: 'Atta', burfiQuantity: 'Burfi',
};
const LITRES = new Set(['milkQuantity', 'curdQuantity', 'lassiQuantity', 'oilQuantity']);

// Quantities are stored in base units (ml / g). Showing the raw number is how
// customers once got told "Milk: 2000", so every display path converts.
function fmtQty(v: number, key: string): string {
  const litre = LITRES.has(key);
  if (v < 1000) return `${v} ${litre ? 'ml' : 'g'}`;
  const s = (v / 1000).toFixed(2).replace(/\.00$/, '');
  return `${s} ${litre ? 'L' : 'kg'}`;
}

function orderLine(o: Order): string {
  const parts = Object.entries(o || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${LABELS[k] || k} ${fmtQty(v, k)}`);
  return parts.join('  ·  ');
}

// Compares planned against actual so a short delivery is visible without
// opening anything. This is what turns the manifest from a list into a check.
function diffLine(planned: Order, actual: Order): string | null {
  const diffs: string[] = [];
  const keys = new Set([...Object.keys(planned || {}), ...Object.keys(actual || {})]);
  keys.forEach((k) => {
    const p = planned?.[k] || 0;
    const a = actual?.[k] || 0;
    if (p !== a) diffs.push(`${LABELS[k] || k}: ${fmtQty(p, k)} → ${fmtQty(a, k)}`);
  });
  return diffs.length ? diffs.join(', ') : null;
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

const STATUS: Record<string, { label: string; bg: string; text: string }> = {
  DELIVERED: { label: 'Delivered', bg: 'bg-green-100', text: 'text-green-800' },
  SKIPPED: { label: 'Skipped', bg: 'bg-blue-100', text: 'text-blue-800' },
  UNATTEMPTED: { label: 'Missed', bg: 'bg-red-100', text: 'text-red-800' },
  FAILED: { label: 'Failed', bg: 'bg-red-100', text: 'text-red-800' },
};

export default function ManifestScreen() {
  const router = useRouter();

  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [slot, setSlot] = useState<'morning' | 'evening'>('morning');
  const [date, setDate] = useState(todayISO());

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const rs = await api.get('/route?page=1&limit=100');
        const list: Route[] = rs || [];
        setRoutes(list);
        if (list.length > 0) setRouteId(list[0].id);
        else setLoading(false);
      } catch (e: any) {
        setError(e.message || 'Could not load routes');
        setLoading(false);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!routeId) return;
    setError(null);
    try {
      const m = await api.get(`/route/${routeId}/manifest?date=${date}&slot=${slot}`);
      setManifest(m);
    } catch (e: any) {
      setError(e.message || 'Could not load the manifest');
      setManifest(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [routeId, date, slot]);

  useEffect(() => {
    if (routeId) {
      setLoading(true);
      load();
    }
  }, [routeId, date, slot, load]);

  const stops = manifest?.stops || [];

  const summary = useMemo(() => {
    const done = stops.filter((s) => s.status === 'DELIVERED').length;
    const missed = stops.filter((s) => s.status && s.status !== 'DELIVERED' && s.status !== 'SKIPPED').length;
    const pending = stops.filter((s) => !s.status).length;
    const short = stops.filter((s) => s.status === 'DELIVERED' && diffLine(s.deliveryOrder, s.actualOrder)).length;
    return { done, missed, pending, short, total: stops.length };
  }, [stops]);

  const isToday = date === todayISO();
  const prettyDate = (() => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  })();

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        {/* Header */}
        <View className="px-5 pt-2 pb-3 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-white border border-slate-200 items-center justify-center active:bg-slate-50"
          >
            <ArrowLeft size={19} color="#0F172A" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-2xl font-black text-slate-900 tracking-tighter">Manifest</Text>
            <Text className="text-xs font-semibold text-slate-400">
              What the driver is delivering
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor="#0F172A"
            />
          }
        >
          {/* Route picker */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 12 }}
          >
            {routes.map((r) => {
              const on = r.id === routeId;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setRouteId(r.id);
                  }}
                  className={`px-4 py-2.5 rounded-xl border ${on ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'}`}
                >
                  <Text className={`text-sm font-bold ${on ? 'text-white' : 'text-slate-600'}`}>
                    {r.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Slot + date */}
          <View className="px-5 mb-4">
            <View className="flex-row bg-slate-200/50 p-1.5 rounded-2xl mb-3">
              {(['morning', 'evening'] as const).map((sl) => {
                const on = slot === sl;
                const Icon = sl === 'morning' ? Sun : Moon;
                return (
                  <Pressable
                    key={sl}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSlot(sl);
                    }}
                    className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl ${on ? 'bg-white shadow-sm' : ''}`}
                  >
                    <Icon size={15} color={on ? (sl === 'morning' ? '#F59E0B' : '#6366F1') : '#64748B'} />
                    <Text className={`text-sm font-bold ${on ? 'text-slate-900' : 'text-slate-500'}`}>
                      {sl === 'morning' ? 'Morning' : 'Evening'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View className="flex-row items-center justify-between bg-white rounded-2xl border border-slate-200 p-2">
              <Pressable
                onPress={() => setDate((d) => shiftDate(d, -1))}
                className="w-10 h-10 rounded-xl bg-slate-100 items-center justify-center active:bg-slate-200"
              >
                <ChevronLeft size={18} color="#0F172A" />
              </Pressable>
              <Pressable onPress={() => setDate(todayISO())}>
                <Text className="font-black text-slate-800 text-base">
                  {prettyDate}{isToday ? ' · Today' : ''}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDate((d) => shiftDate(d, 1))}
                className="w-10 h-10 rounded-xl bg-slate-100 items-center justify-center active:bg-slate-200"
              >
                <ChevronRight size={18} color="#0F172A" />
              </Pressable>
            </View>
          </View>

          {loading ? (
            <View className="py-16 items-center">
              <ActivityIndicator size="large" color="#0F172A" />
            </View>
          ) : error ? (
            <View className="mx-5 bg-white rounded-3xl border border-slate-200 p-8 items-center">
              <AlertTriangle size={34} color="#CBD5E1" />
              <Text className="font-bold text-slate-700 mt-3">Couldn't load the manifest</Text>
              <Text className="text-slate-400 text-sm text-center mt-1 font-medium">{error}</Text>
            </View>
          ) : (
            <>
              {/* Driver + progress */}
              <View className="px-5 mb-4">
                <View className="bg-white rounded-3xl border border-slate-200 p-5">
                  <View className="flex-row items-center gap-3 mb-4">
                    <View className="w-11 h-11 rounded-2xl bg-slate-100 items-center justify-center">
                      <Truck size={20} color="#0F172A" />
                    </View>
                    <View className="flex-1">
                      {manifest?.driverName ? (
                        <>
                          <Text className="font-black text-slate-900 text-base">{manifest.driverName}</Text>
                          {!!manifest.driverPhone && (
                            <Pressable
                              onPress={() => Linking.openURL(`tel:${manifest.driverPhone}`)}
                              className="flex-row items-center gap-1.5 mt-0.5"
                            >
                              <Phone size={12} color="#64748B" />
                              <Text className="text-slate-500 text-xs font-semibold">{manifest.driverPhone}</Text>
                            </Pressable>
                          )}
                        </>
                      ) : (
                        // No driver assigned is not a cosmetic gap: nobody is
                        // going to deliver this round.
                        <>
                          <Text className="font-black text-amber-700 text-base">No driver assigned</Text>
                          <Text className="text-amber-600 text-xs font-semibold mt-0.5">
                            This round has nobody to deliver it
                          </Text>
                        </>
                      )}
                    </View>
                  </View>

                  <View className="flex-row gap-2">
                    <View className="flex-1 bg-slate-50 rounded-2xl p-3 items-center">
                      <Text className="text-xl font-black text-slate-900">{summary.total}</Text>
                      <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Stops</Text>
                    </View>
                    <View className="flex-1 bg-green-50 rounded-2xl p-3 items-center">
                      <Text className="text-xl font-black text-green-800">{summary.done}</Text>
                      <Text className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Done</Text>
                    </View>
                    <View className="flex-1 bg-slate-50 rounded-2xl p-3 items-center">
                      <Text className="text-xl font-black text-slate-900">{summary.pending}</Text>
                      <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Left</Text>
                    </View>
                    {summary.missed > 0 && (
                      <View className="flex-1 bg-red-50 rounded-2xl p-3 items-center">
                        <Text className="text-xl font-black text-red-800">{summary.missed}</Text>
                        <Text className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Missed</Text>
                      </View>
                    )}
                  </View>

                  {summary.short > 0 && (
                    <View className="flex-row items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-3.5 py-2.5 mt-3">
                      <AlertTriangle size={14} color="#B45309" />
                      <Text className="text-amber-800 text-xs font-bold flex-1">
                        {summary.short} {summary.short === 1 ? 'delivery differs' : 'deliveries differ'} from what was planned
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Stops */}
              {stops.length === 0 ? (
                <View className="mx-5 bg-white rounded-3xl border border-slate-200 p-8 items-center">
                  <PackageX size={34} color="#CBD5E1" />
                  <Text className="font-bold text-slate-700 mt-3">Nothing due</Text>
                  <Text className="text-slate-400 text-sm text-center mt-1 font-medium">
                    No customer on this route is scheduled for a {slot} delivery on {prettyDate}.
                  </Text>
                </View>
              ) : (
                <View className="px-5 gap-2.5">
                  {stops.map((s) => {
                    const st = s.status ? STATUS[s.status] : null;
                    const diff = s.status === 'DELIVERED' ? diffLine(s.deliveryOrder, s.actualOrder) : null;
                    return (
                      <Pressable
                        key={`${s.id}-${s.stopOrder}`}
                        onPress={() => router.push(`/admin/customers/${s.id}` as any)}
                        className="bg-white rounded-3xl border border-slate-200 p-4 active:opacity-95"
                      >
                        <View className="flex-row items-start gap-3">
                          <View className="w-8 h-8 rounded-xl bg-slate-100 items-center justify-center mt-0.5">
                            <Text className="font-black text-slate-700 text-xs">{s.stopOrder}</Text>
                          </View>

                          <View className="flex-1">
                            <View className="flex-row items-center justify-between">
                              <Text className="font-black text-slate-900 text-base flex-1 pr-2" numberOfLines={1}>
                                {s.customer}
                              </Text>
                              {st ? (
                                <View className={`px-2 py-0.5 rounded-md ${st.bg}`}>
                                  <Text className={`text-[10px] font-bold uppercase ${st.text}`}>{st.label}</Text>
                                </View>
                              ) : (
                                <Circle size={15} color="#CBD5E1" />
                              )}
                            </View>

                            <View className="flex-row items-start gap-1.5 mt-1">
                              <MapPin size={12} color="#94A3B8" />
                              <Text className="text-slate-500 text-xs font-medium flex-1 leading-4" numberOfLines={2}>
                                {s.houseAddress || 'No address'}
                              </Text>
                            </View>

                            <Text className="text-slate-700 text-xs font-semibold mt-2 leading-5">
                              {orderLine(s.deliveryOrder) || 'Nothing to deliver'}
                            </Text>

                            {/* Only shown when planned and actual disagree —
                                a short delivery is the thing worth surfacing,
                                and repeating a matching order twice is noise. */}
                            {diff && (
                              <View className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-2">
                                <Text className="text-amber-800 text-[11px] font-bold leading-4">
                                  Delivered differently — {diff}
                                </Text>
                              </View>
                            )}

                            {!s.isActive && (
                              <Text className="text-red-600 text-[11px] font-bold mt-1.5">
                                Customer is not active
                              </Text>
                            )}
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
