import type { ThroatClassification } from '../api/classification';
import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
} from 'react';

type SignUpDraftContextValue = {
  profilePhotoClassification: ThroatClassification | null;
  setProfilePhotoClassification: Dispatch<SetStateAction<ThroatClassification | null>>;
  profilePhotoUri: string | null;
  setProfilePhotoUri: Dispatch<SetStateAction<string | null>>;
  profilePhotoDataUrl: string | null;
  setProfilePhotoDataUrl: Dispatch<SetStateAction<string | null>>;
};

const SignUpDraftContext = createContext<SignUpDraftContextValue | null>(null);

export function SignUpDraftProvider({ children }: PropsWithChildren) {
  const [profilePhotoClassification, setProfilePhotoClassification] = useState<ThroatClassification | null>(null);
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  const [profilePhotoDataUrl, setProfilePhotoDataUrl] = useState<string | null>(null);

  return (
    <SignUpDraftContext.Provider
      value={{ profilePhotoClassification, setProfilePhotoClassification, profilePhotoUri, setProfilePhotoUri, profilePhotoDataUrl, setProfilePhotoDataUrl }}
    >
      {children}
    </SignUpDraftContext.Provider>
  );
}

export function useSignUpDraft() {
  const context = useContext(SignUpDraftContext);
  if (!context) {
    throw new Error('useSignUpDraft must be used within SignUpDraftProvider.');
  }

  return context;
}
