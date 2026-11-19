import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, spacing } from '../../../theme/tokens';
import { prefectures } from '../data/prefectures';

type PrefectureSelectProps = {
  label: string;
  value: string | null;
  onChange: (code: string) => void;
};

export function PrefectureSelect({ label, value, onChange }: PrefectureSelectProps) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');
  const selected = prefectures.find(prefecture => prefecture.code === value);
  const filtered = useMemo(() => {
    const query = search.trim();
    return query ? prefectures.filter(prefecture => prefecture.name.includes(query)) : prefectures;
  }, [search]);

  const close = () => {
    setVisible(false);
    setSearch('');
  };

  return <View style={styles.container}>
    <Text style={styles.label}>{label}</Text>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}${selected ? `、${selected.name}` : 'を選択'}`}
      onPress={() => setVisible(true)}
      style={({ pressed }) => [styles.field, pressed && styles.pressed]}
    >
      <Text style={[styles.value, !selected && styles.placeholder]}>{selected?.name ?? '都道府県を選択'}</Text>
      <Ionicons name="chevron-down" size={20} color={colors.mutedText} />
    </Pressable>

    <Modal animationType="slide" transparent visible={visible} onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="閉じる" style={styles.backdrop} onPress={close} />
        <SafeAreaView style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>都道府県を選択</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={close} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.mutedText} />
            </Pressable>
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={19} color={colors.mutedText} />
            <TextInput
              accessibilityLabel="都道府県を検索"
              value={search}
              onChangeText={setSearch}
              placeholder="都道府県を検索"
              placeholderTextColor={colors.mutedText}
              style={styles.searchInput}
            />
          </View>
          <FlatList
            style={styles.prefectureList}
            data={filtered}
            keyExtractor={item => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item.code === value }}
                onPress={() => { onChange(item.code); close(); }}
                style={({ pressed }) => [styles.option, item.code === value && styles.selectedOption, pressed && styles.pressed]}
              >
                <Text style={styles.optionLabel}>{item.name}</Text>
                {item.code === value ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.empty}>該当する都道府県がありません。</Text>}
          />
        </SafeAreaView>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 7 },
  label: { color: colors.text, fontSize: 13, fontWeight: '600' },
  field: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderColor: colors.border, borderWidth: 1, borderRadius: 10, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  value: { color: colors.text, fontSize: 15 },
  placeholder: { color: colors.mutedText },
  pressed: { opacity: 0.7 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(30, 24, 24, 0.38)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { height: '82%', backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  sheetHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchBox: { height: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface, paddingHorizontal: spacing.sm, marginBottom: spacing.sm },
  searchInput: { flex: 1, height: '100%', color: colors.text, fontSize: 15, paddingVertical: 0 },
  prefectureList: { flex: 1 },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingHorizontal: spacing.sm },
  selectedOption: { backgroundColor: colors.primarySoft },
  optionLabel: { color: colors.text, fontSize: 15 },
  empty: { color: colors.mutedText, fontSize: 14, paddingVertical: spacing.lg, textAlign: 'center' },
});
