import { Redirect, router, useLocalSearchParams } from 'expo-router';

import CandidateFeedScreen from './CandidateFeedScreen';
import { hobbyGenres } from '../data/hobbyGenres';

export default function HobbyDiscoverScreen() {
  const { hobby } = useLocalSearchParams<{ hobby?: string }>();
  const genre = hobbyGenres.find(item => item.id === hobby);

  if (!genre) return <Redirect href="/discover" />;

  return (
    <CandidateFeedScreen
      activeTab="search"
      hobbyId={genre.id}
      onExitHobby={() => router.back()}
    />
  );
}
