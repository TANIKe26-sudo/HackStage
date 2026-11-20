import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { getApiBaseUrl } from '../../auth/api/client';
import { useAuth } from '../../auth/context/AuthContext';
import { colors } from '../../../theme/tokens';
import { loadProtectedPhoto } from '../api/protectedPhoto';
import { useResource } from '../api/useResource';

export function ProtectedPhoto({ captureId }: { captureId?: string | null }) {
  const { token } = useAuth();
  return <Photo key={captureId ?? 'empty'} captureId={captureId} token={token} />;
}
function Photo({ captureId, token }: { captureId?: string | null; token: string | null }) {
  const load = useCallback(async (signal: AbortSignal) => ({
    uri: captureId && token ? await loadProtectedPhoto(getApiBaseUrl(), captureId, token, signal) : null,
  }), [captureId, token]);
  const resource = useResource(load);
  if (!captureId || !token) return <Placeholder />;
  if (resource.loading) return <View style={styles.frame}><ActivityIndicator size="small" color={colors.mutedText} /></View>;
  if (!resource.data?.uri || resource.error) return <Placeholder onRetry={() => void resource.refresh()} />;
  return <DecodedPhoto uri={resource.data.uri} onRetry={() => void resource.refresh()} />;
}
function DecodedPhoto({ uri, onRetry }: { uri: string; onRetry: () => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Placeholder onRetry={onRetry} />;
  return <View style={styles.frame}>
    <Image
      accessibilityLabel="公開範囲に応じたプロフィール写真"
      source={{ uri }}
      onError={() => setFailed(true)} resizeMode="cover" style={StyleSheet.absoluteFill}
    />
  </View>;
}
function Placeholder({ onRetry }: { onRetry?: () => void }) {
  return <View style={styles.frame}>
    <Text style={styles.label}>No image</Text>
    {onRetry ? <Pressable accessibilityRole="button" accessibilityLabel="写真を再読み込み" onPress={onRetry} style={{ padding: 8 }}>
      <Text style={styles.label}>再読み込み</Text>
    </Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({ frame: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }, label: { color: colors.mutedText, fontSize: 12 } });
