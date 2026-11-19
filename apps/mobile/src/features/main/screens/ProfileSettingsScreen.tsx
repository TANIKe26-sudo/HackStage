import { Redirect, useLocalSearchParams } from 'expo-router';

import { ProfileSettings, type SettingKind } from '../components/ProfileSettings';

const settingKinds: SettingKind[] = ['visibility', 'calendar', 'location', 'hobbies', 'report', 'hidePeople', 'accountDelete'];

export default function ProfileSettingsScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();

  if (!kind || !settingKinds.includes(kind as SettingKind)) {
    return <Redirect href="/profile" />;
  }

  return <ProfileSettings kind={kind as SettingKind} />;
}
