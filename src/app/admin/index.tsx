import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Users,
  UserCheck,
  AlertCircle,
  ChevronRight,
  Bell,
  X,
  CheckCircle2,
  Phone,
  MapPin,
  Clock,
  Truck,
  IndianRupee,
  PackageCheck,
  Settings,
  ClipboardList,
  GitPullRequest,
  Sun,
  Moon,
  Minus,
  Plus,
  RouteOff,
  AlertTriangle,
  Wallet,
  Ban,
  Receipt,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { api } from '../../utils/api';

// --- TYPES ---

// Mirrors delivery.FlaggedDelivery. quantities/dayTotal were added so the
// admin can correct the bill from here — without them, clearing a flag and
// fixing the charge were two separate journeys and the second rarely happened.
type FlaggedDelivery = {
  id: string;
  customerId: string;
  customerName: string;
  phoneNumber: string;
  houseAddress: string;
  slot: 'morning' | 'evening';
  deliveryDate: string;
  status: string;
  customerFeedback: string;
  updatedAt: string;
  quantities: Record<string, number>;
  dayTotal: number;
};

// Mirrors stats.UnroutedSlot.
// Attention groups everything that is quietly wrong — as opposed to today's
// run, which is loudly right or loudly late. These four were previously
// invisible: they lived only in payment_events, dunning_runs and a status
// column, readable by hand-written SQL and nowhere else.
type PaymentAnomaly = {
  eventId: string;
  outcome: 'ALREADY_PAID' | 'AMOUNT_MISMATCH' | 'UNMATCHED';
  note: string;
  receivedAt: string;
  invoiceId: string | null;
  customerId: string | null;
  customerName: string | null;
  amount: number | null;
};

type StuckChange = {
  changeId: string;
  customerId: string;
  customerName: string;
  effectiveFrom: string;
  daysLate: number;
};

type SuspendedCustomer = {
  customerId: string;
  customerName: string;
  amount: number;
  billingMonth: string;
  suspendedOn: string | null;
};

type DunningStatus = {
  phase: 'GENERATE' | 'REMIND' | 'SUSPEND';
  lastRunOn: string;
  affected: number;
  note: string;
  billingMonth: string;
};

type Attention = {
  paymentAnomalies: PaymentAnomaly[];
  stuckChanges: StuckChange[];
  suspended: SuspendedCustomer[];
  overdueCount: number;
  overdueAmount: number;
  lastDunningRuns: DunningStatus[];
  billingRunMissed: boolean;
};

type UnroutedSlot = {
  customerId: string;
  customerName: string;
  slot: 'morning' | 'evening';
};

// Mirrors stats.AdminStats on the Go side.
type AdminStats = {
  date: string;
  activeDrivers: number;
  totalDrivers: number;
  runsTotal: number;
  runsInProgress: number;
  runsCompleted: number;
  stopsExpected: number;
  stopsDelivered: number;
  completionPct: number;
  pendingApprovals: number;
  flaggedCount: number;
  unroutedSlots: UnroutedSlot[];
  attention: Attention;
  activeCustomers: number;
  monthRevenue: number;
  monthLabel: string;
};

const PRODUCTS = [
  { key: 'milk', label: 'Milk', step: 500 },
  { key: 'curd', label: 'Curd', step: 500 },
  { key: 'butter', label: 'Butter', step: 250 },
  { key: 'ghee', label: 'Ghee', step: 250 },
  { key: 'lassi', label: 'Buttermilk', step: 500 },
  { key: 'paneer', label: 'Paneer', step: 250 },
  { key: 'jaggery', label: 'Jaggery', step: 250 },
  { key: 'khand', label: 'Khand', step: 250 },
  { key: 'oil', label: 'Oil', step: 500 },
  { key: 'atta', label: 'Atta', step: 1000 },
  { key: 'burfi', label: 'Burfi', step: 250 },
];

const LITRE = new Set(['milk', 'curd', 'lassi', 'oil']);

// --- HELPERS ---
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Good afternoon,';
  return 'Good evening,';
}

function rupees(n: number) {
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
  if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k';
  return '₹' + Math.round(n);
}

function fmtQty(v: number, product: string) {
  if (!v) return '—';
  const litre = LITRE.has(product);
  if (v < 1000) return `${v} ${litre ? 'ml' : 'g'}`;
  return `${parseFloat((v / 1000).toFixed(2))} ${litre ? 'L' : 'kg'}`;
}

// --- COMPONENTS ---

// A stat that navigates. Every number on this screen should be a door to the
// screen that explains it — a dashboard you can't drill into is decoration.
const StatCard = ({ label, value, sub, icon: Icon, iconColor, iconBg, onPress }: any) => (
  <Pressable
    onPress={onPress}
    className="flex-1 bg-white rounded-[24px] p-4 border border-slate-200 active:bg-slate-50"
    style={Platform.OS === 'android' ? { elevation: 2 } : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 }}
  >
    <View className="flex-row justify-between items-start mb-3">
      <View className={`w-10 h-10 rounded-2xl items-center justify-center ${iconBg}`}>
        <Icon color={iconColor} size={20} strokeWidth={2.2} />
      </View>
      <ChevronRight color="#CBD5E1" size={16} />
    </View>
    <Text className="text-2xl font-black text-slate-900 tracking-tight">{value}</Text>
    <Text className="text-xs font-bold text-slate-500 mt-0.5">{label}</Text>
    {sub ? <Text className="text-[11px] font-medium text-slate-400 mt-1">{sub}</Text> : null}
  </Pressable>
);

// Shared shape for the navigation cards under the hero.
const EntryCard = ({ icon: Icon, title, subtitle, onPress, badge }: any) => (
  <Pressable
    onPress={onPress}
    className="bg-white border border-slate-200 rounded-2xl p-4 flex-row items-center justify-between active:bg-slate-50"
    style={Platform.OS === 'android' ? { elevation: 1 } : { shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6 }}
  >
    <View className="flex-row items-center gap-3 flex-1">
      <View className="w-10 h-10 rounded-2xl bg-slate-100 items-center justify-center">
        <Icon size={18} color="#0F172A" strokeWidth={2.2} />
      </View>
      <View className="flex-1">
        <Text className="font-black text-slate-900 text-sm">{title}</Text>
        <Text className="text-xs text-slate-500 font-medium mt-0.5">{subtitle}</Text>
      </View>
    </View>
    {badge ? (
      <View className="bg-amber-100 px-2 py-1 rounded-lg mr-1">
        <Text className="text-[11px] font-black text-amber-800">{badge}</Text>
      </View>
    ) : null}
    <ChevronRight size={16} color="#CBD5E1" />
  </Pressable>
);

// Slots that will never be delivered until someone assigns a route.
//
// Deliberately framed as a worklist rather than an alarm. Approving one slot
// and leaving the other for later is a legitimate workflow — you might have
// morning capacity but no evening driver yet — so this may sit non-zero for
// perfectly good reasons. Naming the customers keeps it actionable instead
// of nagging; a bare counter would just become wallpaper.
const UnroutedCard = ({ slots, onPressCustomer }: { slots: UnroutedSlot[]; onPressCustomer: (id: string) => void }) => {
  const [open, setOpen] = useState(false);
  if (!slots.length) return null;

  return (
    <View className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
      <Pressable onPress={() => setOpen(!open)} className="p-4 flex-row items-center gap-3 active:bg-amber-100/50">
        <View className="w-10 h-10 rounded-2xl bg-amber-100 items-center justify-center">
          <RouteOff size={18} color="#B45309" strokeWidth={2.2} />
        </View>
        <View className="flex-1">
          <Text className="font-black text-amber-900 text-sm">
            {slots.length} {slots.length === 1 ? 'slot is' : 'slots are'} waiting for a route
          </Text>
          <Text className="text-xs text-amber-800/80 font-medium mt-0.5">
            These deliveries won't happen until one is assigned
          </Text>
        </View>
        <ChevronRight
          size={16}
          color="#B45309"
          style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
        />
      </Pressable>

      {open && (
        <View className="px-4 pb-3">
          {slots.map((s) => {
            const SlotIcon = s.slot === 'evening' ? Moon : Sun;
            return (
              <Pressable
                key={s.customerId + s.slot}
                onPress={() => onPressCustomer(s.customerId)}
                className="bg-white/70 rounded-xl px-3.5 py-3 mb-2 flex-row items-center gap-2.5 active:bg-white"
              >
                <SlotIcon size={13} color={s.slot === 'evening' ? '#6366F1' : '#F59E0B'} />
                <Text className="font-bold text-amber-900 text-sm flex-1" numberOfLines={1}>
                  {s.customerName}
                </Text>
                <Text className="text-[11px] font-bold text-amber-700 capitalize">{s.slot}</Text>
                <ChevronRight size={13} color="#B45309" />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
};

// Today's shift progress. This is the number an operations person actually
// opens the app to see, so it gets the most visual weight on the screen.
const ProgressHero = ({ stats }: { stats: AdminStats }) => {
  const pct = Math.min(100, Math.max(0, stats.completionPct));
  const nothingDue = stats.stopsExpected === 0;

  return (
    <View
      className="bg-slate-900 rounded-[28px] p-6 mb-4"
      style={
        Platform.OS === 'android'
          ? { elevation: 6 }
          : { shadowColor: '#0F172A', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }
      }
    >
      <View className="flex-row justify-between items-center mb-1">
        <Text className="text-slate-400 text-xs font-bold uppercase tracking-widest">Today's Progress</Text>
        <View className="flex-row items-center gap-1.5">
          <View className={`w-2 h-2 rounded-full ${stats.runsInProgress > 0 ? 'bg-green-400' : 'bg-slate-600'}`} />
          <Text className="text-slate-400 text-[11px] font-bold">
            {stats.runsInProgress > 0 ? `${stats.runsInProgress} running` : 'Idle'}
          </Text>
        </View>
      </View>

      {nothingDue ? (
        <Text className="text-slate-300 font-semibold text-base mt-3">No deliveries scheduled today.</Text>
      ) : (
        <>
          <View className="flex-row items-end gap-2 mt-2 mb-4">
            <Text className="text-white text-5xl font-black tracking-tighter">{pct}%</Text>
            <Text className="text-slate-400 font-bold text-sm mb-2">
              {stats.stopsDelivered} of {stats.stopsExpected} stops
            </Text>
          </View>

          <View className="h-2.5 bg-slate-700/60 rounded-full overflow-hidden">
            <View className="h-full bg-green-400 rounded-full" style={{ width: `${pct}%` }} />
          </View>

          <View className="flex-row justify-between mt-4">
            <Text className="text-slate-400 text-xs font-semibold">
              {stats.runsCompleted}/{stats.runsTotal} runs complete
            </Text>
            <Text className="text-slate-400 text-xs font-semibold">
              {stats.stopsExpected - stats.stopsDelivered} remaining
            </Text>
          </View>
        </>
      )}
    </View>
  );
};

// -------------------------------------------------------------------------
// Resolution sheet
//
// The old version had a single "Mark as Resolved" button that cleared the
// flag and nothing else — so the most common complaint, "an item was
// missing", ended with the flag gone and the customer still billed for it.
// Correcting the quantities IS the bill fix, so it lives here rather than
// three screens away.
// -------------------------------------------------------------------------

const ResolveSheet = ({ issue, onClose, onDone }: any) => {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (issue) {
      setQty({ ...(issue.quantities || {}) });
      setNote('');
    }
  }, [issue]);

  if (!issue) return null;

  const changed = PRODUCTS.some((p) => (qty[p.key] || 0) !== (issue.quantities?.[p.key] || 0));

  // Only products that were actually recorded are shown by default —
  // a driver who delivered milk and curd shouldn't present eleven rows.
  const recorded = PRODUCTS.filter((p) => (issue.quantities?.[p.key] || 0) > 0 || (qty[p.key] || 0) > 0);

  const submit = async (withCorrection: boolean) => {
    setSaving(true);
    try {
      const body: any = {};
      if (withCorrection) body.quantities = qty;
      if (note.trim()) body.note = note.trim();

      const res = await api.post(`/delivery/${issue.id}/resolve`, body);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // The month may already be invoiced, in which case that frozen invoice
      // is now stale. We don't rewrite it automatically — a paid bill must
      // never change silently — so the admin is asked.
      if (res?.invoiceNeedsRegeneration) {
        const paid = res.invoiceStatus && String(res.invoiceStatus).startsWith('PAID');
        Alert.alert(
          'This month is already invoiced',
          paid
            ? `The bill for this month is marked ${res.invoiceStatus === 'PAID_CASH' ? 'paid by cash' : 'paid online'}. Reset it to Pending on the billing screen if the amount genuinely needs to change.`
            : "Their invoice still shows the old amount. Open their bill and tap Recalculate to bring it in line.",
          [{ text: 'Got it' }]
        );
      } else if (res?.changed) {
        Alert.alert(
          'Corrected',
          `Bill adjusted by ${rupees(Math.abs(res.amountAdjusted))}. The customer has been notified on WhatsApp.`
        );
      }

      onDone();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to resolve issue');
    } finally {
      setSaving(false);
    }
  };

  const SlotIcon = issue.slot === 'evening' ? Moon : Sun;

  return (
    <Modal visible={!!issue} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-slate-900/40">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="bg-white rounded-t-[32px] px-6 pt-6 pb-8 max-h-[88%]" style={Platform.OS === 'android' ? { elevation: 24 } : {}}>
          <View className="w-10 h-1.5 bg-slate-200 rounded-full self-center mb-5" />

          <View className="flex-row justify-between items-start mb-4">
            <View className="flex-1 pr-3">
              <Text className="text-xl font-black text-slate-900 tracking-tight">{issue.customerName}</Text>
              <View className="flex-row items-center gap-2 mt-1">
                <SlotIcon size={12} color={issue.slot === 'evening' ? '#6366F1' : '#F59E0B'} />
                <Text className="text-slate-500 text-xs font-bold capitalize">{issue.slot}</Text>
                <Text className="text-slate-300 text-xs">·</Text>
                <Text className="text-slate-500 text-xs font-semibold">
                  {new Date(issue.deliveryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </Text>
                <Text className="text-slate-300 text-xs">·</Text>
                <Text className="text-slate-500 text-xs font-semibold">{rupees(issue.dayTotal)}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} className="h-9 w-9 bg-slate-50 rounded-full items-center justify-center border border-slate-100 active:bg-slate-100">
              <X size={16} color="#64748B" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Complaint */}
            <View className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-5">
              <View className="flex-row items-center gap-2 mb-2">
                <AlertCircle size={13} color="#DC2626" />
                <Text className="text-[11px] font-black text-red-800 uppercase tracking-wider">What they told us</Text>
              </View>
              <Text className="text-slate-800 font-medium leading-5 text-sm">{issue.customerFeedback}</Text>
              <View className="flex-row items-center gap-1.5 mt-3">
                <Phone size={11} color="#94A3B8" />
                <Text className="text-slate-500 text-xs font-medium">{issue.phoneNumber}</Text>
              </View>
              {!!issue.houseAddress && (
                <View className="flex-row items-start gap-1.5 mt-1">
                  <MapPin size={11} color="#94A3B8" style={{ marginTop: 2 }} />
                  <Text className="text-slate-500 text-xs font-medium flex-1">{issue.houseAddress}</Text>
                </View>
              )}
            </View>

            {/* Correction */}
            <Text className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1">
              What was actually delivered?
            </Text>
            <Text className="text-slate-500 text-xs mb-3 leading-4">
              Adjust anything that's wrong. This is what the customer gets billed for.
            </Text>

            <View className="bg-slate-50 rounded-2xl border border-slate-100 px-4 mb-4">
              {recorded.length === 0 ? (
                <Text className="text-slate-400 text-sm py-4 text-center">Nothing was recorded for this delivery.</Text>
              ) : (
                recorded.map((p, i) => {
                  const current = qty[p.key] || 0;
                  const original = issue.quantities?.[p.key] || 0;
                  const isChanged = current !== original;
                  return (
                    <View
                      key={p.key}
                      className={`flex-row items-center justify-between py-3 ${i < recorded.length - 1 ? 'border-b border-slate-200/70' : ''}`}
                    >
                      <View className="flex-1">
                        <Text className="font-bold text-slate-700 text-sm">{p.label}</Text>
                        {isChanged && (
                          <Text className="text-[11px] text-slate-400 font-medium mt-0.5">
                            was {fmtQty(original, p.key)}
                          </Text>
                        )}
                      </View>
                      <View className="flex-row items-center gap-2">
                        <Pressable
                          onPress={() => setQty((q) => ({ ...q, [p.key]: Math.max(0, (q[p.key] || 0) - p.step) }))}
                          disabled={current === 0}
                          className={`h-8 w-8 rounded-lg items-center justify-center border ${current === 0 ? 'border-slate-100 bg-slate-50 opacity-40' : 'border-slate-200 bg-white active:bg-slate-100'}`}
                        >
                          <Minus size={14} color="#334155" />
                        </Pressable>
                        <Text className={`w-[70px] text-center text-sm font-black ${isChanged ? 'text-emerald-700' : 'text-slate-800'}`}>
                          {fmtQty(current, p.key)}
                        </Text>
                        <Pressable
                          onPress={() => setQty((q) => ({ ...q, [p.key]: (q[p.key] || 0) + p.step }))}
                          className="h-8 w-8 rounded-lg items-center justify-center border border-slate-200 bg-white active:bg-slate-100"
                        >
                          <Plus size={14} color="#334155" />
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Internal note (optional) — e.g. driver confirmed shortfall"
              multiline
              maxLength={200}
              className="bg-white border border-slate-200 rounded-2xl px-4 py-3 min-h-[60px] text-sm text-slate-700 mb-4"
              style={{ textAlignVertical: 'top' }}
            />
          </ScrollView>

          {/* Actions */}
          {changed ? (
            <Pressable
              onPress={() => submit(true)}
              disabled={saving}
              className="bg-emerald-600 h-14 rounded-2xl items-center justify-center flex-row gap-2 active:opacity-90"
            >
              {saving ? <ActivityIndicator color="white" /> : (
                <>
                  <CheckCircle2 size={18} color="white" />
                  <Text className="text-white text-base font-black tracking-wide">Correct bill & resolve</Text>
                </>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={() => submit(false)}
              disabled={saving}
              className="bg-slate-900 h-14 rounded-2xl items-center justify-center flex-row gap-2 active:opacity-90"
            >
              {saving ? <ActivityIndicator color="white" /> : (
                <>
                  <CheckCircle2 size={18} color="white" />
                  <Text className="text-white text-base font-black tracking-wide">Resolve — nothing to change</Text>
                </>
              )}
            </Pressable>
          )}

          {changed && (
            <Text className="text-center text-slate-400 text-[11px] font-medium mt-2.5">
              The customer will be told what changed and by how much
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
};

// -------------------------------------------------------------------------
// Screen
// -------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Attention section
// ---------------------------------------------------------------------------

const rupees = (v: number) => {
  const n = Math.round(Math.abs(v));
  const str = String(n);
  if (str.length <= 3) return (v < 0 ? '-' : '') + str;
  const last3 = str.slice(-3);
  let rest = str.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) { parts.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
  if (rest) parts.unshift(rest);
  return (v < 0 ? '-' : '') + parts.join(',') + ',' + last3;
};

// AlertBanner is reserved for things that are actively costing money right
// now. Deliberately loud and deliberately rare — if everything is an alert,
// nothing is.
function AlertBanner({ title, body, onPress }: { title: string; body: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="bg-red-50 border border-red-200 rounded-3xl p-5 mb-3 active:opacity-90"
    >
      <View className="flex-row items-start gap-3">
        <AlertTriangle size={20} color="#B91C1C" />
        <View className="flex-1">
          <Text className="text-red-900 font-black text-base">{title}</Text>
          <Text className="text-red-700 text-sm font-medium mt-1 leading-5">{body}</Text>
        </View>
      </View>
    </Pressable>
  );
}

// PaymentAnomaliesCard — every row here means money moved in a way we
// couldn't fully reconcile, and none of it was visible anywhere before.
function PaymentAnomaliesCard({
  anomalies,
  onPressCustomer,
}: {
  anomalies: PaymentAnomaly[];
  onPressCustomer: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const LABEL: Record<string, { text: string; detail: string; tone: string }> = {
    ALREADY_PAID: {
      text: 'Paid twice',
      detail: 'Refund owed',
      tone: 'text-red-700',
    },
    AMOUNT_MISMATCH: {
      text: 'Wrong amount',
      detail: 'Paid a different amount than billed',
      tone: 'text-amber-700',
    },
    UNMATCHED: {
      text: 'No matching bill',
      detail: "Money arrived we can't tie to anyone",
      tone: 'text-red-700',
    },
  };

  const refundsOwed = anomalies.filter((a) => a.outcome === 'ALREADY_PAID').length;

  return (
    <View className="bg-white rounded-3xl border border-red-200 mb-3 overflow-hidden">
      <Pressable onPress={() => setOpen((o) => !o)} className="p-5 active:bg-slate-50">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-2xl bg-red-50 items-center justify-center">
            <Wallet size={19} color="#B91C1C" />
          </View>
          <View className="flex-1">
            <Text className="font-black text-slate-900 text-base">
              {anomalies.length} payment {anomalies.length === 1 ? 'issue' : 'issues'}
            </Text>
            <Text className="text-slate-500 text-xs font-semibold mt-0.5">
              {refundsOwed > 0
                ? `${refundsOwed} customer${refundsOwed === 1 ? '' : 's'} owed a refund`
                : 'Needs reconciling'}
            </Text>
          </View>
          {open ? <ChevronUp size={18} color="#94A3B8" /> : <ChevronDown size={18} color="#94A3B8" />}
        </View>
      </Pressable>

      {open && (
        <View className="border-t border-slate-100">
          {anomalies.slice(0, 12).map((a) => {
            const l = LABEL[a.outcome] || { text: a.outcome, detail: '', tone: 'text-slate-700' };
            return (
              <Pressable
                key={a.eventId}
                onPress={() => a.customerId && onPressCustomer(a.customerId)}
                disabled={!a.customerId}
                className="px-5 py-3.5 border-b border-slate-100 active:bg-slate-50"
              >
                <View className="flex-row items-center justify-between">
                  <Text className={`font-bold text-sm ${l.tone}`}>{l.text}</Text>
                  {a.amount != null && (
                    <Text className="font-black text-slate-900 text-sm">₹{rupees(a.amount)}</Text>
                  )}
                </View>
                <Text className="text-slate-600 text-xs font-semibold mt-0.5">
                  {a.customerName || 'Unknown customer'} · {a.receivedAt}
                </Text>
                {!!a.note && (
                  <Text className="text-slate-400 text-[11px] mt-1 leading-4" numberOfLines={2}>
                    {a.note}
                  </Text>
                )}
              </Pressable>
            );
          })}
          {anomalies.length > 12 && (
            <Text className="text-slate-400 text-xs font-semibold px-5 py-3">
              +{anomalies.length - 12} more
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// SuspendedCard — customers cut off for non-payment. The amount is the
// actionable number: it's what switches them back on.
function SuspendedCard({
  suspended,
  onPressCustomer,
}: {
  suspended: SuspendedCustomer[];
  onPressCustomer: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const total = suspended.reduce((a, s) => a + s.amount, 0);

  return (
    <View className="bg-white rounded-3xl border border-amber-200 mb-3 overflow-hidden">
      <Pressable onPress={() => setOpen((o) => !o)} className="p-5 active:bg-slate-50">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-2xl bg-amber-50 items-center justify-center">
            <Ban size={19} color="#B45309" />
          </View>
          <View className="flex-1">
            <Text className="font-black text-slate-900 text-base">
              {suspended.length} suspended
            </Text>
            <Text className="text-slate-500 text-xs font-semibold mt-0.5">
              ₹{rupees(total)} outstanding — deliveries stopped
            </Text>
          </View>
          {open ? <ChevronUp size={18} color="#94A3B8" /> : <ChevronDown size={18} color="#94A3B8" />}
        </View>
      </Pressable>

      {open && (
        <View className="border-t border-slate-100">
          {suspended.map((s) => (
            <Pressable
              key={s.customerId}
              onPress={() => onPressCustomer(s.customerId)}
              className="px-5 py-3.5 border-b border-slate-100 flex-row items-center justify-between active:bg-slate-50"
            >
              <View className="flex-1 pr-3">
                <Text className="font-bold text-slate-800 text-sm">{s.customerName}</Text>
                <Text className="text-slate-400 text-xs font-semibold mt-0.5">
                  {s.billingMonth}{s.suspendedOn ? ` · since ${s.suspendedOn}` : ''}
                </Text>
              </View>
              <Text className="font-black text-slate-900 text-sm">₹{rupees(s.amount)}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// StuckChangesCard should never render. A row here means the sweeper failed
// to apply an approved change: the customer was told their new order starts
// tomorrow, it didn't, and the request also vanished from the review queue
// because that filters on PENDING.
function StuckChangesCard({
  changes,
  onPressCustomer,
}: {
  changes: StuckChange[];
  onPressCustomer: (id: string) => void;
}) {
  return (
    <View className="bg-white rounded-3xl border border-red-200 mb-3 overflow-hidden">
      <View className="p-5 flex-row items-center gap-3">
        <View className="w-10 h-10 rounded-2xl bg-red-50 items-center justify-center">
          <GitPullRequest size={19} color="#B91C1C" />
        </View>
        <View className="flex-1">
          <Text className="font-black text-slate-900 text-base">
            {changes.length} order {changes.length === 1 ? 'change' : 'changes'} never applied
          </Text>
          <Text className="text-slate-500 text-xs font-semibold mt-0.5 leading-4">
            Approved, the date passed, and the customer's order never changed
          </Text>
        </View>
      </View>
      <View className="border-t border-slate-100">
        {changes.map((c) => (
          <Pressable
            key={c.changeId}
            onPress={() => onPressCustomer(c.customerId)}
            className="px-5 py-3.5 border-b border-slate-100 flex-row items-center justify-between active:bg-slate-50"
          >
            <Text className="font-bold text-slate-800 text-sm flex-1 pr-3">{c.customerName}</Text>
            <Text className="text-red-700 font-bold text-xs">
              {c.daysLate} {c.daysLate === 1 ? 'day' : 'days'} late
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// BillingHealthCard reports whether the automated cycle actually ran.
//
// A dashboard that shows revenue but not whether anyone was billed for it is
// telling half the story — and a missed run on the 1st produces no bill, no
// reminder, no suspension, and no error.
function BillingHealthCard({ runs, overdueCount, overdueAmount }: {
  runs: DunningStatus[];
  overdueCount: number;
  overdueAmount: number;
}) {
  const byPhase = (p: string) => runs.find((r) => r.phase === p);
  const gen = byPhase('GENERATE');

  return (
    <View className="bg-white rounded-3xl border border-slate-200 p-5 mb-3">
      <View className="flex-row items-center gap-3 mb-3">
        <View className="w-10 h-10 rounded-2xl bg-slate-100 items-center justify-center">
          <Receipt size={19} color="#0F172A" />
        </View>
        <View className="flex-1">
          <Text className="font-black text-slate-900 text-base">Billing</Text>
          <Text className="text-slate-500 text-xs font-semibold mt-0.5">
            {overdueCount > 0
              ? `₹${rupees(overdueAmount)} unpaid across ${overdueCount} ${overdueCount === 1 ? 'bill' : 'bills'}`
              : 'Nothing outstanding'}
          </Text>
        </View>
      </View>

      <View className="bg-slate-50 rounded-2xl p-3.5">
        {gen ? (
          <Text className="text-slate-600 text-xs font-semibold">
            Last invoice run: {gen.lastRunOn} — {gen.affected} {gen.affected === 1 ? 'bill' : 'bills'} for {gen.billingMonth}
          </Text>
        ) : (
          <Text className="text-slate-500 text-xs font-semibold">
            No invoice run recorded yet.
          </Text>
        )}
        {runs
          .filter((r) => r.phase !== 'GENERATE' && r.affected > 0)
          .map((r) => (
            <Text key={r.phase} className="text-slate-500 text-xs font-medium mt-1.5">
              {r.phase === 'REMIND' ? 'Reminders' : 'Suspensions'}: {r.affected} on {r.lastRunOn}
            </Text>
          ))}
      </View>
    </View>
  );
}


export default function AdminDashboard() {
  const router = useRouter();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [flaggedIssues, setFlaggedIssues] = useState<FlaggedDelivery[]>([]);
  const [changeCount, setChangeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedIssue, setSelectedIssue] = useState<FlaggedDelivery | null>(null);

  const fetchDashboardData = useCallback(async () => {
    // allSettled, not all — one endpoint failing shouldn't blank the whole screen.
    const [statsRes, issuesRes, changesRes] = await Promise.allSettled([
      api.get('/stats'),
      api.get('/delivery/flagged?limit=10'),
      api.get('/update/changes'),
    ]);

    if (statsRes.status === 'fulfilled') setStats(statsRes.value);
    else console.log('Stats failed:', statsRes.reason?.message);

    if (issuesRes.status === 'fulfilled') setFlaggedIssues(issuesRes.value || []);
    else console.log('Flagged failed:', issuesRes.reason?.message);

    if (changesRes.status === 'fulfilled') setChangeCount((changesRes.value || []).length);
    else console.log('Changes failed:', changesRes.reason?.message);

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Approving a customer on another tab should be reflected when you come
  // back here, so refetch on focus rather than only on mount.
  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
    }, [fetchDashboardData])
  );

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown Date';
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const go = (path: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path as any);
  };

  const unrouted = stats?.unroutedSlots || [];

  return (
    <View className="flex-1 bg-slate-50">
      <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchDashboardData();
              }}
              tintColor="#0F172A"
            />
          }
        >
          {/* Header: greeting on the left, action buttons grouped on the right. */}
          <View className="flex-row justify-between items-center px-6 pt-5 pb-5">
            <View className="flex-1">
              <Text className="text-base font-medium text-slate-500 tracking-wide">{greeting()}</Text>
              <Text className="text-3xl font-black text-slate-900 tracking-tighter mt-1">Admin</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => go('/admin/customers')}
                className="w-12 h-12 bg-white rounded-full justify-center items-center border border-slate-200 active:bg-slate-50"
              >
                <Bell color="#0F172A" size={22} strokeWidth={2} />
                {(flaggedIssues.length > 0 ||
                  changeCount > 0 ||
                  unrouted.length > 0 ||
                  (stats?.pendingApprovals ?? 0) > 0 ||
                  (stats?.attention?.paymentAnomalies.length ?? 0) > 0 ||
                  (stats?.attention?.stuckChanges.length ?? 0) > 0 ||
                  (stats?.attention?.suspended.length ?? 0) > 0 ||
                  stats?.attention?.billingRunMissed) && (
                    <View className="absolute top-3 right-3.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white" />
                  )}
              </Pressable>
              <Pressable
                onPress={() => go('/admin/settings')}
                className="w-12 h-12 bg-white rounded-full justify-center items-center border border-slate-200 active:bg-slate-50"
              >
                <Settings color="#0F172A" size={22} strokeWidth={2} />
              </Pressable>
            </View>
          </View>

          {loading ? (
            <View className="py-20 items-center">
              <ActivityIndicator size="large" color="#0F172A" />
            </View>
          ) : (
            <>
              {/* ATTENTION — things that are quietly wrong.
                  Deliberately above today's run. The operational numbers tell
                  you whether the vans went out, which someone checks anyway.
                  These tell you about failures nobody would otherwise notice:
                  a customer owed a refund, an order change that never applied,
                  a month where no bills went out at all. Putting them below
                  the fold would be the same as not having them. */}
              {stats?.attention && (
                <View className="px-5">
                  {stats.attention.billingRunMissed && (
                    <AlertBanner
                      title="No bills have gone out this month"
                      body="The invoice run hasn't recorded a result since the 1st. Nobody has been billed, so nobody will pay. Check the server is running and open Billing to generate manually."
                      onPress={() => go('/admin/billing')}
                    />
                  )}

                  {stats.attention.stuckChanges.length > 0 && (
                    <StuckChangesCard
                      changes={stats.attention.stuckChanges}
                      onPressCustomer={(id) => go(`/admin/customers/${id}`)}
                    />
                  )}

                  {stats.attention.paymentAnomalies.length > 0 && (
                    <PaymentAnomaliesCard
                      anomalies={stats.attention.paymentAnomalies}
                      onPressCustomer={(id) => go(`/admin/customers/${id}`)}
                    />
                  )}

                  {stats.attention.suspended.length > 0 && (
                    <SuspendedCard
                      suspended={stats.attention.suspended}
                      onPressCustomer={(id) => go(`/admin/customers/${id}`)}
                    />
                  )}
                </View>
              )}

              {/* Live progress */}
              <View className="px-5">
                {stats ? (
                  <ProgressHero stats={stats} />
                ) : (
                  <View className="bg-white rounded-[28px] p-6 mb-4 border border-slate-200 items-center">
                    <Text className="text-slate-500 font-semibold">Couldn't load today's stats.</Text>
                    <Text className="text-slate-400 text-xs mt-1">Pull down to retry.</Text>
                  </View>
                )}
              </View>

              {/* Unrouted slots — above the other queues because it's the one
                  failure nobody would otherwise notice: the customer is
                  active, nothing errors, and the delivery just never happens. */}
              {unrouted.length > 0 && (
                <View className="px-5 mb-2">
                  <UnroutedCard slots={unrouted} onPressCustomer={(id) => go(`/admin/customers/${id}`)} />
                </View>
              )}

              {/* Work queues. These sit directly under the hero because they're
                  the "something needs a human" surfaces. */}
              <View className="px-5 mb-2">
                <EntryCard
                  icon={GitPullRequest}
                  title="Change Requests"
                  subtitle="Customer profile & order edits awaiting review"
                  badge={changeCount > 0 ? changeCount : null}
                  onPress={() => go('/admin/change-requests')}
                />
              </View>

              {stats?.attention && (
                <View className="px-5">
                  <BillingHealthCard
                    runs={stats.attention.lastDunningRuns}
                    overdueCount={stats.attention.overdueCount}
                    overdueAmount={stats.attention.overdueAmount}
                  />
                </View>
              )}

              {/* Manifest sits above delivery logs: logs are what happened,
                  the manifest is what is happening now. During a round that's
                  the more urgent question. */}
              <View className="px-5 mb-2">
                <EntryCard
                  icon={Truck}
                  title="Manifest"
                  subtitle="What each driver is delivering today"
                  badge={null}
                  onPress={() => go('/admin/manifest')}
                />
              </View>

              <View className="px-5 mb-4">
                <EntryCard
                  icon={ClipboardList}
                  title="Delivery Logs"
                  subtitle="Review, edit, or fix any log"
                  onPress={() => go('/admin/delivery-logs')}
                />
              </View>

              {/* Stat grid */}
              {stats && (
                <>
                  <View className="flex-row px-5 gap-3 mb-3">
                    <StatCard
                      label="Pending Approvals"
                      value={stats.pendingApprovals}
                      sub={stats.pendingApprovals > 0 ? 'Needs review' : 'All clear'}
                      icon={UserCheck}
                      iconColor="#D97706"
                      iconBg="bg-amber-50"
                      onPress={() => go('/admin/customers')}
                    />
                    <StatCard
                      label="Active Drivers"
                      value={stats.activeDrivers}
                      sub={`${stats.totalDrivers} total`}
                      icon={Truck}
                      iconColor="#2563EB"
                      iconBg="bg-blue-50"
                      onPress={() => go('/admin/drivers')}
                    />
                  </View>

                  <View className="flex-row px-5 gap-3 mb-8">
                    <StatCard
                      label="Revenue This Month"
                      value={rupees(stats.monthRevenue)}
                      sub={stats.monthLabel}
                      icon={IndianRupee}
                      iconColor="#059669"
                      iconBg="bg-emerald-50"
                      onPress={() => go('/admin/billing')}
                    />
                    <StatCard
                      label="Active Customers"
                      value={stats.activeCustomers}
                      sub={`${stats.stopsExpected} stops today`}
                      icon={Users}
                      iconColor="#7C3AED"
                      iconBg="bg-violet-50"
                      onPress={() => go('/admin/customers')}
                    />
                  </View>
                </>
              )}

              {/* Action Required */}
              <View className="px-5 mb-8">
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-xl font-black text-slate-900 tracking-tight">Action Required</Text>
                  {flaggedIssues.length > 0 && (
                    <View className="bg-red-100 px-2.5 py-1 rounded-lg">
                      <Text className="text-xs font-black text-red-700">{flaggedIssues.length}</Text>
                    </View>
                  )}
                </View>

                {flaggedIssues.length === 0 ? (
                  <View className="bg-white rounded-3xl p-6 border border-slate-200 items-center justify-center">
                    <PackageCheck size={32} color="#10B981" />
                    <Text className="text-slate-800 font-bold text-base mt-3">All clear!</Text>
                    <Text className="text-slate-500 text-sm mt-1">No customer complaints pending.</Text>
                  </View>
                ) : (
                  flaggedIssues.map((issue) => {
                    const SlotIcon = issue.slot === 'evening' ? Moon : Sun;
                    return (
                      <Pressable
                        key={issue.id}
                        onPress={() => setSelectedIssue(issue)}
                        className="bg-white rounded-3xl p-4 border border-red-100 flex-row items-center gap-4 mb-3 active:bg-slate-50"
                        style={
                          Platform.OS === 'android'
                            ? { elevation: 2 }
                            : { shadowColor: '#EF4444', shadowOpacity: 0.05, shadowRadius: 8 }
                        }
                      >
                        <View className="w-12 h-12 rounded-full bg-red-50 justify-center items-center">
                          <AlertCircle color="#EF4444" size={24} strokeWidth={2.5} />
                        </View>
                        <View className="flex-1">
                          <Text className="text-base font-black text-slate-900 mb-0.5">
                            {issue.customerName}
                          </Text>
                          {/* Which delivery this was about. Without the slot a
                              two-slot customer's complaint was ambiguous. */}
                          <View className="flex-row items-center gap-1.5 mb-1">
                            <SlotIcon size={11} color={issue.slot === 'evening' ? '#6366F1' : '#F59E0B'} />
                            <Text className="text-[11px] font-bold text-slate-500 capitalize">{issue.slot}</Text>
                            <Text className="text-slate-300 text-[11px]">·</Text>
                            <Text className="text-[11px] font-semibold text-slate-500">
                              {formatDate(issue.deliveryDate)}
                            </Text>
                          </View>
                          <Text className="text-sm font-medium text-slate-500" numberOfLines={1}>
                            {issue.customerFeedback}
                          </Text>
                        </View>
                        <ChevronRight color="#94A3B8" size={20} />
                      </Pressable>
                    );
                  })
                )}
              </View>
            </>
          )}
        </ScrollView>

        <ResolveSheet
          issue={selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onDone={fetchDashboardData}
        />
      </SafeAreaView>
    </View>
  );
}
