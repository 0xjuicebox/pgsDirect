import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft, Sun, Moon, CircleCheck, CircleSlash, CircleAlert,
  X, Banknote, Smartphone, Clock, Share2, FileText,
} from 'lucide-react-native';

import { api } from '../../../utils/api';

// -------------------------------------------------------------------------
// Types — mirror billing.BillDay / billing.CustomerTally
// -------------------------------------------------------------------------

type BillDay = {
  logId: string;
  date: string;
  slot: 'morning' | 'evening';
  status: string;
  quantities: { [key: string]: number };
  dayTotal: number;
  isFlagged: boolean;
};

type InvoiceBreakdown = {
  quantities: { [key: string]: number };
  prices: { [key: string]: number };
  lineTotals: { [key: string]: number };
};

type CustomerTally = {
  customerId: string;
  customerName: string;
  phoneNumber: string;
  deliveryCount: number;
  totalAmount: number;
  breakdown: InvoiceBreakdown;
  invoiceId: string | null;
  invoiceStatus: string | null;
  isFinalized: boolean;
};

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Litre-based products; everything else is weight. Quantities are stored in
// base units (ml / g), matching the customer-facing order forms.
const LITRE_PRODUCTS = new Set(['milk', 'curd', 'lassi', 'oil']);

const LABELS: { [key: string]: string } = {
  milk: 'Milk', curd: 'Curd', butter: 'Butter', ghee: 'Desi Ghee',
  lassi: 'Buttermilk', paneer: 'Paneer', jaggery: 'Jaggery', khand: 'Desi Khand',
  oil: 'Mustard Oil', atta: 'Atta', burfi: 'Milk Burfi',
};

function rupees(n: number) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

// 500 -> "500 ml", 1500 -> "1.5 L". Mirrors the formatter in update.html so
// admin and customer see the same numbers described the same way.
function formatQty(val: number, product: string) {
  const litre = LITRE_PRODUCTS.has(product);
  if (val < 1000) return `${val} ${litre ? 'ml' : 'g'}`;
  return `${parseFloat((val / 1000).toFixed(2))} ${litre ? 'L' : 'kg'}`;
}

function labelForMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function prettyDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

const STATUS_META: Record<string, { label: string; cls: string; text: string }> = {
  PAID_ONLINE: { label: 'Paid · Online', cls: 'bg-green-100 border-green-200', text: 'text-green-800' },
  PAID_CASH: { label: 'Paid · Cash', cls: 'bg-green-100 border-green-200', text: 'text-green-800' },
  PENDING: { label: 'Pending', cls: 'bg-amber-100 border-amber-200', text: 'text-amber-800' },
};

// -------------------------------------------------------------------------
// Screen
// -------------------------------------------------------------------------

export default function CustomerBillScreen() {
  const { id, month: monthParam, name: nameParam } = useLocalSearchParams<{
    id: string; month?: string; name?: string;
  }>();
  const router = useRouter();

  const month = monthParam || new Date().toISOString().slice(0, 7);

  const [days, setDays] = useState<BillDay[]>([]);
  const [tally, setTally] = useState<CustomerTally | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);

  const fetchBill = useCallback(async () => {
    // Two sources: the per-day log comes from /billing/customer/{id}, but the
    // product-level price breakdown only exists on the aggregated tally, so we
    // pull /billing/live and pick this customer out of it. allSettled keeps the
    // day list rendering even if the aggregate call fails.
    const [dayRes, liveRes] = await Promise.allSettled([
      api.get(`/billing/customer/${id}?month=${month}`),
      api.get(`/billing/live?month=${month}`),
    ]);

    if (dayRes.status === 'fulfilled') {
      setDays(dayRes.value?.days || []);
    } else {
      Alert.alert('Error', dayRes.reason?.message || 'Failed to load bill');
    }

    if (liveRes.status === 'fulfilled') {
      const found = (liveRes.value?.tallies || []).find((t: CustomerTally) => t.customerId === id);
      setTally(found || null);
    }

    setLoading(false);
    setRefreshing(false);
  }, [id, month]);

  useEffect(() => {
    fetchBill();
  }, [fetchBill]);

  const handleMarkPaid = async (status: string) => {
    if (!tally?.invoiceId) return;
    try {
      await api.put(`/billing/invoices/${tally.invoiceId}/status`, { status });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowPayModal(false);
      fetchBill();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update status');
    }
  };

  // Builds the message a customer actually receives when they dispute a bill.
  // Sent client-side via wa.me rather than through the backend WhatsApp
  // service — no template approval needed, and the admin sees it before it goes.
  const handleShare = () => {
    if (!tally) return;
    const lines = [
      `*PGS Direct — ${labelForMonth(month)}*`,
      `Hello ${tally.customerName},`,
      '',
      `Deliveries: ${tally.deliveryCount}`,
      '',
      ...Object.entries(tally.breakdown?.lineTotals || {})
        .filter(([, total]) => total > 0)
        .map(([p, total]) => {
          const q = tally.breakdown.quantities[p] || 0;
          return `${LABELS[p] || p}: ${formatQty(q, p)} — ${rupees(total)}`;
        }),
      '',
      `*Total: ${rupees(tally.totalAmount)}*`,
    ];
    const phone = (tally.phoneNumber || '').replace(/[^0-9]/g, '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open WhatsApp.'));
  };

  // Group the flat day list into calendar days, since a customer on both slots
  // has two rows per date and showing them separately reads as duplicates.
  const grouped = useMemo(() => {
    const map = new Map<string, BillDay[]>();
    days.forEach((d) => {
      const list = map.get(d.date) || [];
      list.push(d);
      map.set(d.date, list);
    });
    return Array.from(map.entries());
  }, [days]);

  const deliveredCount = days.filter((d) => d.status === 'DELIVERED').length;
  const missedCount = days.length - deliveredCount;
  const statusMeta = tally?.invoiceStatus ? STATUS_META[tally.invoiceStatus] : null;
  const displayName = tally?.customerName || nameParam || 'Customer';

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        {/* Header */}
        <View className="flex-row items-center gap-3 px-5 pt-2 pb-4">
          <Pressable
            onPress={() => router.back()}
            className="w-11 h-11 bg-white rounded-2xl items-center justify-center border border-slate-200 active:bg-slate-50"
          >
            <ChevronLeft size={20} color="#0F172A" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-xl font-black text-slate-900 tracking-tight" numberOfLines={1}>
              {displayName}
            </Text>
            <Text className="text-xs font-semibold text-slate-400">{labelForMonth(month)}</Text>
          </View>
          {tally && (
            <Pressable
              onPress={handleShare}
              className="w-11 h-11 bg-white rounded-2xl items-center justify-center border border-slate-200 active:bg-slate-50"
            >
              <Share2 size={18} color="#0F172A" />
            </Pressable>
          )}
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#0F172A" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); fetchBill(); }}
                tintColor="#0F172A"
              />
            }
          >
            {/* Total card */}
            <View className="mx-5 mb-4 bg-slate-900 rounded-[28px] p-6">
              <Text className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Amount Due</Text>
              <Text className="text-white text-4xl font-black tracking-tighter">
                {rupees(tally?.totalAmount ?? 0)}
              </Text>
              <View className="flex-row items-center gap-3 mt-4">
                <Text className="text-slate-400 text-xs font-semibold">{deliveredCount} delivered</Text>
                {missedCount > 0 && (
                  <>
                    <View className="w-1 h-1 rounded-full bg-slate-600" />
                    <Text className="text-slate-400 text-xs font-semibold">{missedCount} not delivered</Text>
                  </>
                )}
              </View>

              {statusMeta && (
                <View className={`self-start px-2.5 py-1 rounded-lg border mt-4 ${statusMeta.cls}`}>
                  <Text className={`text-[10px] font-bold uppercase ${statusMeta.text}`}>{statusMeta.label}</Text>
                </View>
              )}
            </View>

            {/* Mark paid — only once the month is frozen into an invoice */}
            {tally?.isFinalized && (
              <Pressable
                onPress={() => setShowPayModal(true)}
                className="mx-5 mb-6 bg-white border border-slate-200 rounded-2xl p-4 flex-row items-center justify-center gap-2 active:bg-slate-50"
              >
                <Banknote size={18} color="#0F172A" />
                <Text className="font-black text-slate-800 text-sm">Update Payment Status</Text>
              </Pressable>
            )}

            {/* Product breakdown — the "why" behind the total */}
            {tally?.breakdown && (
              <>
                <Text className="px-5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                  Product Breakdown
                </Text>
                <View className="mx-5 mb-6 bg-white rounded-3xl border border-slate-200 overflow-hidden">
                  {Object.entries(tally.breakdown.lineTotals || {})
                    .filter(([, total]) => total > 0)
                    .map(([p, total], i, arr) => (
                      <View
                        key={p}
                        className={`flex-row items-center justify-between px-5 py-4 ${i < arr.length - 1 ? 'border-b border-slate-100' : ''
                          }`}
                      >
                        <View className="flex-1">
                          <Text className="font-bold text-slate-800 text-sm">{LABELS[p] || p}</Text>
                          <Text className="text-slate-400 text-xs font-semibold mt-0.5">
                            {formatQty(tally.breakdown.quantities[p] || 0, p)}
                            {' · '}
                            {rupees(tally.breakdown.prices[p] || 0)}/unit
                          </Text>
                        </View>
                        <Text className="font-black text-slate-900">{rupees(total)}</Text>
                      </View>
                    ))}
                </View>
              </>
            )}

            {/* Day by day */}
            <Text className="px-5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
              Delivery Log
            </Text>

            {grouped.length === 0 ? (
              <View className="items-center justify-center py-12">
                <FileText size={40} color="#CBD5E1" />
                <Text className="text-slate-500 font-bold mt-3">No deliveries this month</Text>
              </View>
            ) : (
              grouped.map(([date, entries]) => (
                <View key={date} className="mx-5 mb-3 bg-white rounded-3xl border border-slate-200 overflow-hidden">
                  <View className="px-5 pt-4 pb-2">
                    <Text className="font-black text-slate-800 text-sm">{prettyDate(date)}</Text>
                  </View>

                  {entries.map((e, i) => {
                    const delivered = e.status === 'DELIVERED';
                    const items = Object.entries(e.quantities || {}).filter(([, q]) => q > 0);
                    return (
                      <View
                        key={e.logId}
                        className={`px-5 py-3 ${i < entries.length - 1 ? 'border-b border-slate-100' : 'pb-4'}`}
                      >
                        <View className="flex-row items-center justify-between mb-1.5">
                          <View className="flex-row items-center gap-2">
                            {e.slot === 'morning'
                              ? <Sun size={14} color="#F59E0B" />
                              : <Moon size={14} color="#6366F1" />}
                            <Text className="text-xs font-bold text-slate-500 capitalize">{e.slot}</Text>

                            {delivered ? (
                              <CircleCheck size={14} color="#10B981" />
                            ) : (
                              <CircleSlash size={14} color="#94A3B8" />
                            )}
                            {!delivered && (
                              <Text className="text-[10px] font-bold text-slate-400 uppercase">{e.status}</Text>
                            )}
                            {e.isFlagged && <CircleAlert size={14} color="#EF4444" />}
                          </View>

                          <Text className={`font-black text-sm ${delivered ? 'text-slate-900' : 'text-slate-300'}`}>
                            {delivered ? rupees(e.dayTotal) : '—'}
                          </Text>
                        </View>

                        <Text className="text-xs text-slate-400 font-medium leading-4">
                          {items.length === 0
                            ? 'Nothing recorded'
                            : items.map(([p, q]) => `${LABELS[p] || p} ${formatQty(q, p)}`).join(' · ')}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* Mark-paid modal */}
        <Modal visible={showPayModal} transparent animationType="slide" onRequestClose={() => setShowPayModal(false)}>
          <View className="flex-1 justify-end bg-slate-900/40">
            <Pressable className="absolute inset-0" onPress={() => setShowPayModal(false)} />
            <View className="bg-white rounded-t-[32px] p-6 pb-10">
              <View className="w-10 h-1 bg-slate-200 rounded-full self-center mb-6" />
              <View className="flex-row justify-between items-center mb-1">
                <Text className="text-2xl font-black text-slate-800">Payment Status</Text>
                <Pressable
                  onPress={() => setShowPayModal(false)}
                  className="h-10 w-10 bg-slate-50 rounded-full items-center justify-center border border-slate-100"
                >
                  <X size={18} color="#64748B" />
                </Pressable>
              </View>
              <Text className="text-slate-500 font-medium mb-6">
                {displayName} · {rupees(tally?.totalAmount ?? 0)}
              </Text>

              <Pressable
                onPress={() => handleMarkPaid('PAID_CASH')}
                className="flex-row items-center gap-3 p-4 rounded-2xl border border-green-200 bg-green-50 mb-3 active:opacity-80"
              >
                <Banknote size={20} color="#16A34A" />
                <Text className="font-bold text-green-800">Mark Paid — Cash</Text>
              </Pressable>
              <Pressable
                onPress={() => handleMarkPaid('PAID_ONLINE')}
                className="flex-row items-center gap-3 p-4 rounded-2xl border border-green-200 bg-green-50 mb-3 active:opacity-80"
              >
                <Smartphone size={20} color="#16A34A" />
                <Text className="font-bold text-green-800">Mark Paid — Online</Text>
              </Pressable>
              <Pressable
                onPress={() => handleMarkPaid('PENDING')}
                className="flex-row items-center gap-3 p-4 rounded-2xl border border-slate-200 bg-slate-50 active:opacity-80"
              >
                <Clock size={20} color="#64748B" />
                <Text className="font-bold text-slate-600">Reset to Pending</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}
