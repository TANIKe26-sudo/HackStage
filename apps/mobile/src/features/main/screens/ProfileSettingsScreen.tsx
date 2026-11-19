import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ProfileSettings, type SettingKind } from '../components/ProfileSettings';

const settingKinds: SettingKind[] = ['visibility', 'calendar', 'location', 'hobbies', 'report', 'hidePeople', 'accountDelete'];

export default function ProfileSettingsScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const [isAgeRangeDragging, setIsAgeRangeDragging] = useState(false);

  if (!kind || !settingKinds.includes(kind as SettingKind)) {
    return <Redirect href="/profile" />;
  }

  return <>
    <Stack.Screen options={{ gestureEnabled: kind !== 'location' || !isAgeRangeDragging }} />
    <ProfileSettings kind={kind as SettingKind} onAgeRangeDraggingChange={setIsAgeRangeDragging} />
  </>;
}
