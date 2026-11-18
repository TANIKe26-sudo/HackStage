import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { getApiBaseUrl } from '../../auth/api/client';
import { useAuth } from '../../auth/context/AuthContext';
import { colors } from '../../../theme/tokens';

export function ProtectedPhoto({ captureId }: { captureId?: string | null }) {
  const { token } = useAuth();
  return <Photo key={`${captureId}:${token}`} captureId={captureId} token={token} />;
}
function Photo({ captureId, token }: { captureId?: string | null; token: string | null }) {
  const [failed, setFailed] = useState(false);
  return <View style={styles.frame}>
    {captureId && token && !failed ? <Image
      accessibilityLabel="公開範囲に応じたプロフィール写真"
      source={{ uri: `${getApiBaseUrl()}/api/captures/${encodeURIComponent(captureId)}/image`, headers: { Authorization: `Bearer ${token}` }, cache: 'reload' }}
      onError={() => setFailed(true)} resizeMode="cover" style={StyleSheet.absoluteFill}
    /> : <Text style={styles.label}>No image</Text>}
  </View>;
}
const styles = StyleSheet.create({ frame: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }, label: { color: colors.mutedText, fontSize: 12 } });
