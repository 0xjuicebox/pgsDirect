import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Modal,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  Sun,
  Moon,
  AlertTriangle,
  Save,
  Clock,
  Info,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { api } from '../../utils/api';

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

// Mirrors config.SystemConfig on the Go side. ComplaintCutoffTime is
// nullable — null means "no window, customers can complain about any past
// delivery indefinitely."
type SystemConfig = {
  morningCutoffTime: string;
  eveningCutoffTime: string;
  morningShiftEndTime: string;
  eveningShiftEndTime: string;
  complaintCutoffTime: string | null;
};

// -------------------------------------------------------------------------
// Time formatting helpers
//
// Backend stores/returns "HH:MM:SS" (24h). We display "hh:mm AM/PM" in the
// UI since admins reading "03:00" as morning cutoff sometimes read it as
// 3 PM at a glance. Round-trip carefully — never lose seconds even if
// they'll always be :00, so we don't accidentally strip a value that
// might one day matter.
// -------------------------------------------------------------------------

function to12Hour(hhmmss: string): string {
  if (!hhmmss) return '';
  const [h, m] = hhmmss.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

// Parse "hh:mm AM/PM" back to "HH:MM:00". Returns null on unparseable input.
function to24Hour(display: string): string | null {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(display.trim());
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (hour < 1 || hour > 12 || min < 0 || min > 59) return null;
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
}

// -------------------------------------------------------------------------
// Time picker
//
// Native date/time pickers on RN require the community picker package,
// and setting one up just for three fields is heavy. Instead: a modal
// with hour/minute wheels made from Pressables. Enough for admin usage
// (touched maybe once a month) and adds zero dependencies.
// -------------------------------------------------------------------------

const TimePickerModal = ({ visible, initial, onClose, onSave }: any) => {
  const [hour, setHour] = useState(1);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');

  useEffect(() => {
    if (!visible || !initial) return;
    // Seed pickers from the current stored value.
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(to12Hour(initial));
    if (m) {
      setHour(parseInt(m[1], 10));
      setMinute(parseInt(m[2], 10));
      setAmpm(m[3].toUpperCase() as any);
    }
  }, [visible, initial]);

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = [0, 15, 30, 45];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-slate-900/40">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="bg-white rounded-t-[32px] p-6 pb-10" style={Platform.OS === 'android' ? { elevation: 24 } : {}}>
          <View className="w-10 h-1 bg-slate-200 rounded-full self-center mb-6" />
          <Text className="text-2xl font-black text-slate-800 tracking-tight mb-1">Pick a time</Text>
          <Text className="text-slate-500 text-sm font-medium mb-6">Times are in IST</Text>

          {/* Hour picker */}
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Hour</Text>
          <View className="flex-row flex-wrap gap-2 mb-5">
            {hours.map((h) => (
              <Pressable
                key={h}
                onPress={() => setHour(h)}
                className={`w-14 h-11 rounded-xl items-center justify-center border ${hour === h ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'}`}
              >
                <Text className={`font-black text-base ${hour === h ? 'text-white' : 'text-slate-700'}`}>{h}</Text>
              </Pressable>
            ))}
          </View>

          {/* Minute picker */}
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Minute</Text>
          <View className="flex-row gap-2 mb-5">
            {minutes.map((m) => (
              <Pressable
                key={m}
                onPress={() => setMinute(m)}
                className={`flex-1 h-11 rounded-xl items-center justify-center border ${minute === m ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'}`}
              >
                <Text className={`font-black text-base ${minute === m ? 'text-white' : 'text-slate-700'}`}>:{String(m).padStart(2, '0')}</Text>
              </Pressable>
            ))}
          </View>

          {/* AM/PM */}
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">AM / PM</Text>
          <View className="flex-row gap-2 mb-6">
            {(['AM', 'PM'] as const).map((label) => (
              <Pressable
                key={label}
                onPress={() => setAmpm(label)}
                className={`flex-1 h-11 rounded-xl items-center justify-center border ${ampm === label ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'}`}
              >
                <Text className={`font-black text-base ${ampm === label ? 'text-white' : 'text-slate-700'}`}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={() => {
              const val = to24Hour(`${hour}:${String(minute).padStart(2, '0')} ${ampm}`);
              if (val) onSave(val);
            }}
            className="bg-slate-900 h-14 rounded-2xl items-center justify-center active:opacity-90"
          >
            <Text className="text-white font-black text-base tracking-wide">Save Time</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

// -------------------------------------------------------------------------
// Setting row — one editable cutoff
// -------------------------------------------------------------------------

const CutoffRow = ({ icon: Icon, iconColor, iconBg, label, description, value, onChange, disabled, onDisableToggle }: any) => (
  <View className="bg-white rounded-3xl p-5 mb-3 border border-slate-200">
    <View className="flex-row items-start justify-between mb-3">
      <View className="flex-row items-center gap-3 flex-1 pr-3">
        <View className={`w-10 h-10 rounded-2xl items-center justify-center ${iconBg}`}>
          <Icon color={iconColor} size={20} strokeWidth={2.2} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-black text-slate-800 tracking-tight">{label}</Text>
          <Text className="text-slate-500 text-xs font-medium mt-0.5 leading-4">{description}</Text>
        </View>
      </View>

      {onDisableToggle && (
        <Switch
          value={!disabled}
          onValueChange={onDisableToggle}
          trackColor={{ false: '#E2E8F0', true: '#10B981' }}
          thumbColor="#FFFFFF"
        />
      )}
    </View>

    {!disabled ? (
      <Pressable
        onPress={onChange}
        className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 flex-row items-center justify-between active:bg-slate-100"
      >
        <View className="flex-row items-center gap-2">
          <Clock size={14} color="#64748B" />
          <Text className="text-slate-700 font-bold">{value ? to12Hour(value) : 'Not set'}</Text>
        </View>
        <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">Tap to edit</Text>
      </Pressable>
    ) : (
      <View className="bg-slate-50 border border-slate-100 border-dashed rounded-2xl px-4 py-3">
        <Text className="text-slate-400 font-semibold text-sm text-center">Disabled — no cutoff enforced</Text>
      </View>
    )}
  </View>
);

// -------------------------------------------------------------------------
// Screen
// -------------------------------------------------------------------------

export default function AdminSettingsScreen() {
  const router = useRouter();

  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [complaintDisabled, setComplaintDisabled] = useState(false);

  const [picker, setPicker] = useState<null | { field: keyof SystemConfig; value: string }>(null);

  const load = useCallback(async () => {
    try {
      const data: SystemConfig = await api.get('/config');
      setConfig(data);
      setComplaintDisabled(data.complaintCutoffTime === null);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not load configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const patch = (field: keyof SystemConfig, value: string | null) => {
    setConfig((prev) => (prev ? { ...prev, [field]: value } : prev));
    setDirty(true);
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.put('/config', {
        morningCutoffTime: config.morningCutoffTime,
        eveningCutoffTime: config.eveningCutoffTime,
        morningShiftEndTime: config.morningShiftEndTime,
        eveningShiftEndTime: config.eveningShiftEndTime,
        // Two mutually-exclusive fields for complaint cutoff, matching the
        // backend's UpdateRequest shape: either send a value or send
        // clearComplaintCutoff=true. See config.go for why.
        complaintCutoffTime: complaintDisabled ? null : config.complaintCutoffTime,
        clearComplaintCutoff: complaintDisabled,
      });
      setDirty(false);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Configuration updated. Changes take effect immediately.');
    } catch (err: any) {
      Alert.alert('Save failed', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return (
      <View className="flex-1 bg-slate-50 justify-center items-center">
        <ActivityIndicator size="large" color="#0F172A" />
      </View>
    );
  }

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
            <Text className="text-xl font-black text-slate-900 tracking-tight">Settings</Text>
            <Text className="text-xs font-semibold text-slate-400">System cutoffs and windows</Text>
          </View>
        </View>

        <ScrollView
          // The save bar floats above the tab dock at ~88px and is itself
          // ~95px tall, so while it's visible the last section would sit
          // behind it. Padding tracks whether the bar is showing rather than
          // reserving dead space when it isn't.
          contentContainerStyle={{ paddingBottom: dirty ? 220 : 120 }}
          showsVerticalScrollIndicator={false}
          className="px-5">
          {/* Section: customer order cutoffs
              When a customer can no longer change TODAY's order for a slot.
              Enforced in override.Submit; future dates are always editable. */}
          <View className="flex-row items-center gap-2 mt-2 mb-3">
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">Customer order cutoffs</Text>
          </View>

          <CutoffRow
            icon={Sun}
            iconColor="#F59E0B"
            iconBg="bg-amber-50"
            label="Morning order cutoff"
            description="Customers can't change today's morning order past this time. Tomorrow onwards stays open."
            value={config.morningCutoffTime}
            onChange={() => setPicker({ field: 'morningCutoffTime', value: config.morningCutoffTime })}
          />

          <CutoffRow
            icon={Moon}
            iconColor="#6366F1"
            iconBg="bg-indigo-50"
            label="Evening order cutoff"
            description="Customers can't change today's evening order past this time. Must be earlier than the evening shift end."
            value={config.eveningCutoffTime}
            onChange={() => setPicker({ field: 'eveningCutoffTime', value: config.eveningCutoffTime })}
          />

          {/* Section: shift end times
              Separate from the order cutoffs above. These only flip an ACTIVE
              shift to AUTO_ENDED so the dashboard's "runs in progress" count
              settles; drivers can still log deliveries afterwards. */}
          <View className="flex-row items-center gap-2 mt-6 mb-3">
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">Driver shift end times</Text>
          </View>

          <CutoffRow
            icon={Sun}
            iconColor="#F59E0B"
            iconBg="bg-amber-50"
            label="Morning shift ends"
            description="Morning shifts still running past this are marked auto-ended. Deliveries still work; this only affects the dashboard status."
            value={config.morningShiftEndTime}
            onChange={() => setPicker({ field: 'morningShiftEndTime', value: config.morningShiftEndTime })}
          />

          <CutoffRow
            icon={Moon}
            iconColor="#6366F1"
            iconBg="bg-indigo-50"
            label="Evening shift ends"
            description="Evening shifts still running past this are marked auto-ended. Deliveries still work; this only affects the dashboard status."
            value={config.eveningShiftEndTime}
            onChange={() => setPicker({ field: 'eveningShiftEndTime', value: config.eveningShiftEndTime })}
          />

          {/* Section: complaint window */}
          <View className="flex-row items-center gap-2 mt-6 mb-3">
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">Customer complaints</Text>
          </View>

          <CutoffRow
            icon={AlertTriangle}
            iconColor="#DC2626"
            iconBg="bg-red-50"
            label="Complaint cutoff"
            description="How long after delivery a customer can still flag an issue. Applied on the day after — e.g. 2 AM means 'until 2 AM tomorrow'."
            value={config.complaintCutoffTime || ''}
            disabled={complaintDisabled}
            onDisableToggle={(enabled: boolean) => {
              setComplaintDisabled(!enabled);
              setDirty(true);
            }}
            onChange={() => setPicker({ field: 'complaintCutoffTime', value: config.complaintCutoffTime || '02:00:00' })}
          />

          {/* Info footer */}
          <View className="mt-4 bg-blue-50/50 border border-blue-100 rounded-2xl p-4 flex-row gap-3">
            <Info size={16} color="#2563EB" />
            <Text className="text-blue-900 text-xs font-medium flex-1 leading-5">
              All times are IST (Asia/Kolkata). Changes take effect immediately for new requests, but shifts already auto-ended today stay auto-ended.
            </Text>
          </View>
        </ScrollView>

        {/* Save bar — only appears when dirty.
            Offset above the floating tab dock rather than sitting at bottom-0:
            the dock is 68px tall with a 16px inset, so a bar flush to the
            bottom was covered by it and the Save button couldn't be tapped. */}
        {dirty && (
          <View className="absolute left-0 right-0 bg-white border-t border-slate-200 px-5 py-4"
            style={[
              { bottom: Platform.OS === 'ios' ? 100 : 88 },
              Platform.OS === 'android'
                ? { elevation: 12 }
                : { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 } },
            ]}>
            <SafeAreaView edges={['bottom']}>
              <Pressable
                onPress={save}
                disabled={saving}
                className="bg-slate-900 h-14 rounded-2xl items-center justify-center flex-row gap-2 active:opacity-90"
              >
                {saving ? <ActivityIndicator color="white" /> : (
                  <>
                    <Save size={16} color="white" />
                    <Text className="text-white text-base font-black tracking-wide">Save Changes</Text>
                  </>
                )}
              </Pressable>
            </SafeAreaView>
          </View>
        )}

        <TimePickerModal
          visible={!!picker}
          initial={picker?.value || ''}
          onClose={() => setPicker(null)}
          onSave={(value: string) => {
            if (picker) patch(picker.field, value);
            setPicker(null);
          }}
        />
      </SafeAreaView>
    </View>
  );
}
