import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { colors, spacing } from '../../../theme/tokens';

type FormFieldProps = {
  label: string;
  placeholder: string;
  keyboardType?: KeyboardTypeOptions;
  value?: string;
  onChangeText?: (value: string) => void;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
};

export function FormField({
  label,
  placeholder,
  keyboardType = 'default',
  value,
  onChangeText,
  secureTextEntry = false,
  autoCapitalize,
  maxLength,
}: FormFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedText}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 7,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    minHeight: 46,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: spacing.md,
  },
});
