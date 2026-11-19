import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../../theme/tokens';

type DatePickerFieldProps = {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
};

const weekDays = ['日', '月', '火', '水', '木', '金', '土'];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDate(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（${weekDays[date.getDay()]}）`;
}

export function DatePickerField({ label, value, onChange }: DatePickerFieldProps) {
  const [visible, setVisible] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(value ?? new Date()));
  const calendarDays = useMemo(() => {
    const offset = month.getDay();
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;
    return Array.from({ length: cellCount }, (_, index) => {
      const day = index - offset + 1;
      return day < 1 || day > daysInMonth ? null : day;
    });
  }, [month]);

  const open = () => {
    setMonth(startOfMonth(value ?? new Date()));
    setVisible(true);
  };
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const latestDate = new Date(todayStart);
  latestDate.setDate(latestDate.getDate() + 180);
  const monthLabel = `${month.getFullYear()}年${month.getMonth() + 1}月`;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}${value ? `、${formatDate(value)}` : 'を選択'}`}
        onPress={open}
        style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
      >
        <Text style={[styles.dateText, !value && styles.placeholder]}>{value ? formatDate(value) : '日付を選択'}</Text>
        <Ionicons name="calendar-outline" size={21} color={colors.mutedText} />
      </Pressable>

      <Modal animationType="fade" transparent visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <Pressable accessibilityLabel="カレンダーを閉じる" onPress={() => setVisible(false)} style={styles.backdrop} />
          <View style={styles.dialog}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>日付を選択</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={() => setVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={23} color={colors.mutedText} />
              </Pressable>
            </View>
            <View style={styles.monthHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="前の月" onPress={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))} style={styles.monthButton}>
                <Ionicons name="chevron-back" size={20} color={colors.mutedText} />
              </Pressable>
              <Text style={styles.monthLabel}>{monthLabel}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="次の月" onPress={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))} style={styles.monthButton}>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
              </Pressable>
            </View>
            <View style={styles.calendarGrid}>
              {weekDays.map((day, index) => (
                <View key={day} style={styles.calendarCell}>
                  <Text style={[styles.weekDay, index === 0 && styles.sunday, index === 6 && styles.saturday]}>{day}</Text>
                </View>
              ))}
              {calendarDays.map((day, index) => {
                if (day === null) return <View key={`empty-${index}`} style={styles.calendarCell} />;
                const date = new Date(month.getFullYear(), month.getMonth(), day);
                const isUnavailable = date < todayStart || date > latestDate;
                const isSelected = value?.getFullYear() === date.getFullYear()
                  && value.getMonth() === date.getMonth()
                  && value.getDate() === date.getDate();
                return (
                  <View key={day} style={styles.calendarCell}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={formatDate(date)}
                      accessibilityState={{ selected: isSelected, disabled: isUnavailable }}
                      disabled={isUnavailable}
                      onPress={() => { onChange(date); setVisible(false); }}
                      style={({ pressed }) => [styles.dayButton, isSelected && styles.selectedDay, pressed && styles.pressed]}
                    >
                      <Text style={[styles.dayText, isSelected && styles.selectedDayText, isUnavailable && styles.disabledDayText]}>{day}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { color: colors.text, fontSize: 14 },
  dateField: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  dateText: { color: colors.text, fontSize: 15 },
  placeholder: { color: colors.mutedText },
  pressed: { opacity: 0.7 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(30, 24, 24, 0.38)' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: 20, padding: spacing.lg, backgroundColor: colors.background },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dialogTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: spacing.xs },
  monthButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { color: colors.text, fontSize: 16, fontWeight: '700' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center' },
  weekDay: { color: colors.mutedText, fontSize: 13, fontWeight: '600' },
  sunday: { color: colors.primary },
  saturday: { color: colors.primary },
  dayButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  selectedDay: { backgroundColor: colors.primary },
  dayText: { color: colors.text, fontSize: 14 },
  selectedDayText: { color: colors.white, fontWeight: '700' },
  disabledDayText: { color: colors.border },
});
