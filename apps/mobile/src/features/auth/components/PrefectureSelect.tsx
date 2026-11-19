import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Keyboard, Modal, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

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
  const { height: windowHeight } = useWindowDimensions();
  const animationProgress = useRef(new Animated.Value(0)).current;
  const isClosing = useRef(false);
  const selected = prefectures.find(prefecture => prefecture.code === value);
  const filtered = useMemo(() => {
    const query = search.trim();
    return query ? prefectures.filter(prefecture => prefecture.name.includes(query)) : prefectures;
  }, [search]);

  useEffect(() => {
    if (!visible) return;
    const opening = Animated.timing(animationProgress, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    });
    opening.start();
    return () => opening.stop();
  }, [animationProgress, visible]);

  const close = useCallback(() => {
    if (isClosing.current) return;
    isClosing.current = true;
    Keyboard.dismiss();
    Animated.timing(animationProgress, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setVisible(false);
        setSearch('');
      }
      isClosing.current = false;
    });
  }, [animationProgress]);

  const backdropOpacity = animationProgress;
  const sheetTranslateY = animationProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [windowHeight * 0.82, 0],
  });
  return <View style={styles.container}>
    <Text style={styles.label}>{label}</Text>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}${selected ? `、${selected.name}` : 'を選択'}`}
      onPress={() => {
        Keyboard.dismiss();
        isClosing.current = false;
        animationProgress.stopAnimation();
        animationProgress.setValue(0);
        setVisible(true);
      }}
      style={({ pressed }) => [styles.field, pressed && styles.pressed]}
    >
      <Text style={[styles.value, !selected && styles.placeholder]}>{selected?.name ?? '都道府県を選択'}</Text>
      <Ionicons name="chevron-down" size={20} color={colors.mutedText} />
    </Pressable>

    <Modal animationType="none" transparent visible={visible} onRequestClose={close}>
      <View style={styles.overlay}>
        <Animated.View pointerEvents="none" style={[styles.backdropShade, { opacity: backdropOpacity }]} />
        <Pressable accessibilityLabel="閉じる" style={styles.backdrop} onPressIn={close} onPress={close} />
        <Animated.View style={[styles.sheetAnimation, { transform: [{ translateY: sheetTranslateY }] }]}>
          <SafeAreaView style={styles.sheet}>
            <View style={styles.sheetContent}>
              <View style={styles.sheetTop}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>都道府県を選択</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPressIn={close} onPress={close} style={styles.closeButton}>
                    <Ionicons name="close" size={24} color={colors.mutedText} />
                  </Pressable>
                </View>
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
            </View>
          </SafeAreaView>
        </Animated.View>
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
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdropShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(30, 24, 24, 0.38)' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheetAnimation: { width: '100%', height: '82%' },
  sheet: { flex: 1, backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetContent: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  sheetTop: { paddingBottom: spacing.sm },
  sheetHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
