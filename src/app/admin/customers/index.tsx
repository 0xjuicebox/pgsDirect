import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Platform,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  UserCheck,
  MapPin,
  Phone,
  Search,
  X,
  AlertTriangle,
  ArrowUpDown,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { api } from '../../../utils/api';

// Customer is identity-only — no routeId/stopOrder. Those live per-slot on
// subscriptions, which the list doesn't fetch (avoids an N+1 call per row
// just to render a directory).
type Customer = {
  id: string;
  customer: string;
  phoneNumber: string;
  houseAddress: string;
  status: 'pending' | 'active' | 'disabled' | 'rejected' | 'suspended';
  isActive: boolean;
};

type FilterKey = 'pending' | 'active' | 'suspended' | 'inactive' | 'all';
type SortKey = 'name' | 'status';

const STATUS_STYLE: Record<string, { chip: string; text: string; label: string }> = {
  active: { chip: 'bg-green-100 border-green-200', text: 'text-green-800', label: 'Active' },
  pending: { chip: 'bg-amber-100 border-amber-200', text: 'text-amber-800', label: 'Pending' },
  suspended: { chip: 'bg-red-100 border-red-200', text: 'text-red-800', label: 'Suspended' },
  rejected: { chip: 'bg-slate-200 border-slate-300', text: 'text-slate-700', label: 'Rejected' },
  disabled: { chip: 'bg-slate-100 border-slate-200', text: 'text-slate-600', label: 'Paused' },
};

// Filters are ordered by how often an admin needs them: pending is the
// worklist, suspended is money owed, the rest are lookup.
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'active', label: 'Active' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'inactive', label: 'Paused' },
  { key: 'all', label: 'All' },
];

// normalisePhone strips everything but digits so a search for "9876543210"
// matches a stored "+91 98765 43210". Admins read numbers off a bill or a
// missed call, not out of the database.
const normalisePhone = (s: string) => s.replace(/\D/g, '');

export default function CustomersScreen() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filterStatus, setFilterStatus] = useState<FilterKey>('pending');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // NOTE: still capped at 100. Beyond that this list silently truncates
      // and search will appear to "lose" customers. Needs real pagination
      // before the customer count grows past a pilot route.
      const custData = await api.get('/customer?page=1&limit=100');
      setCustomers(custData || []);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load customers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      pending: 0, active: 0, suspended: 0, inactive: 0, all: customers.length,
    };
    customers.forEach((cu) => {
      if (cu.status === 'pending') c.pending++;
      else if (cu.status === 'active') c.active++;
      else if (cu.status === 'suspended') c.suspended++;
      else c.inactive++;
    });
    return c;
  }, [customers]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = normalisePhone(query);

    let list = customers.filter((c) => {
      // Status filter
      if (filterStatus === 'pending' && c.status !== 'pending') return false;
      if (filterStatus === 'active' && c.status !== 'active') return false;
      if (filterStatus === 'suspended' && c.status !== 'suspended') return false;
      if (filterStatus === 'inactive' && !['disabled', 'rejected'].includes(c.status)) return false;

      if (!q) return true;

      // Search across name, phone and address. Phone is matched on digits
      // only so formatting differences don't cause a miss.
      const nameHit = (c.customer || '').toLowerCase().includes(q);
      const addrHit = (c.houseAddress || '').toLowerCase().includes(q);
      const phoneHit = qDigits.length >= 3 && normalisePhone(c.phoneNumber || '').includes(qDigits);
      return nameHit || addrHit || phoneHit;
    });

    list = [...list].sort((a, b) => {
      if (sortBy === 'status') {
        // Surface the states that need action first, then alphabetical
        // within each group.
        const rank: Record<string, number> = {
          pending: 0, suspended: 1, active: 2, disabled: 3, rejected: 4,
        };
        const d = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
        if (d !== 0) return d;
      }
      return (a.customer || '').localeCompare(b.customer || '');
    });

    return list;
  }, [customers, filterStatus, query, sortBy]);

  const renderHeader = () => (
    <View className="px-5 pt-4 pb-3">
      <Text className="text-3xl font-black text-slate-800 tracking-tighter">Customers</Text>
      <Text className="text-sm font-semibold text-slate-400 mb-4">
        {customers.length} on file — tap to route, approve, or view bills
      </Text>

      {/* Search. Placed above the filters because an admin looking for one
          specific person shouldn't have to guess which tab they're in. */}
      <View className="flex-row items-center bg-white border border-slate-200 rounded-2xl px-4 mb-3">
        <Search size={18} color="#94A3B8" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, phone or address"
          placeholderTextColor="#94A3B8"
          autoCorrect={false}
          autoCapitalize="none"
          className="flex-1 py-3.5 px-3 text-slate-800 font-semibold"
          style={{ outlineStyle: 'none' } as any}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <X size={18} color="#94A3B8" />
          </Pressable>
        )}
      </View>

      {/* Filter chips scroll horizontally rather than squeezing five equal
          segments into the width — the labels stay readable. */}
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 8 }}
        renderItem={({ item }) => {
          const active = filterStatus === item.key;
          const n = counts[item.key] ?? 0;
          const urgent = (item.key === 'pending' || item.key === 'suspended') && n > 0;
          return (
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFilterStatus(item.key);
              }}
              className={`px-4 py-2.5 rounded-xl border ${active ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'
                }`}
            >
              <View className="flex-row items-center gap-1.5">
                {urgent && !active && <View className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                <Text className={`text-sm font-bold ${active ? 'text-white' : 'text-slate-600'}`}>
                  {item.label}
                </Text>
                <Text className={`text-sm font-bold ${active ? 'text-slate-400' : 'text-slate-400'}`}>
                  {n}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />

      <View className="flex-row items-center justify-between mt-3">
        <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          {visible.length} shown
        </Text>
        <Pressable
          onPress={() => setSortBy((s) => (s === 'name' ? 'status' : 'name'))}
          className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100"
          hitSlop={8}
        >
          <ArrowUpDown size={13} color="#64748B" />
          <Text className="text-xs font-bold text-slate-600">
            {sortBy === 'name' ? 'Name' : 'Needs action'}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1">
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#16A34A" />
          </View>
        ) : (
          <FlatList
            data={visible}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={renderHeader}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  fetchData();
                }}
                tintColor="#16A34A"
              />
            }
            ListEmptyComponent={
              <View className="items-center justify-center mt-10 px-8">
                <UserCheck size={48} color="#CBD5E1" />
                <Text className="text-slate-700 font-bold text-base mt-4">
                  {query ? 'No matches' : 'No customers here'}
                </Text>
                <Text className="text-slate-400 font-medium text-center mt-2">
                  {query
                    ? `Nothing matching "${query}" in this filter. Try the All tab.`
                    : 'There are no customers with this status.'}
                </Text>
                {query.length > 0 && (
                  <Pressable
                    onPress={() => { setQuery(''); setFilterStatus('all'); }}
                    className="mt-4 px-4 py-2.5 rounded-xl bg-slate-900"
                  >
                    <Text className="text-white font-bold text-sm">Clear and show all</Text>
                  </Pressable>
                )}
              </View>
            }
            renderItem={({ item }) => {
              const s = STATUS_STYLE[item.status] || STATUS_STYLE.pending;
              // is_active and status are a known dual source of truth. When
              // they disagree the row says so rather than silently picking
              // one — a customer marked active but flagged inactive won't
              // appear on any manifest, and that's worth seeing here.
              const mismatch = item.status === 'active' && !item.isActive;
              return (
                <Pressable
                  onPress={() => router.push(`/admin/customers/${item.id}`)}
                  className="bg-white rounded-3xl p-5 mx-5 mb-3 border border-slate-200 active:opacity-95"
                  style={
                    Platform.OS === 'android'
                      ? { elevation: 2 }
                      : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 }
                  }
                >
                  <View className="flex-row justify-between items-start mb-3">
                    <View className="flex-1 pr-2">
                      <Text className="text-xl font-black text-slate-800 tracking-tight">
                        {item.customer}
                      </Text>
                      <View className="flex-row items-center gap-1.5 mt-1">
                        <Phone size={12} color="#64748B" />
                        <Text className="text-slate-500 text-sm font-semibold">
                          {item.phoneNumber}
                        </Text>
                      </View>
                    </View>
                    <View className={`px-2.5 py-1 rounded-lg border ${s.chip}`}>
                      <Text className={`text-[10px] font-bold uppercase tracking-wider ${s.text}`}>
                        {s.label}
                      </Text>
                    </View>
                  </View>

                  {mismatch && (
                    <View className="flex-row items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl mb-2">
                      <AlertTriangle size={13} color="#B45309" />
                      <Text className="text-amber-800 text-xs font-bold flex-1">
                        Marked active but not receiving deliveries
                      </Text>
                    </View>
                  )}

                  <View className="flex-row items-start gap-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <MapPin size={16} color="#64748B" />
                    <Text className="text-slate-600 text-sm font-medium flex-1 leading-5">
                      {item.houseAddress || 'No address on file'}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </SafeAreaView>
    </View>
  );
}
