import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
} from 'react';

type SignUpDraftContextValue = {
  profilePhotoUri: string | null;
  setProfilePhotoUri: Dispatch<SetStateAction<string | null>>;
};

const SignUpDraftContext = createContext<SignUpDraftContextValue | null>(null);

export function SignUpDraftProvider({ children }: PropsWithChildren) {
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);

  return (
    <SignUpDraftContext.Provider value={{ profilePhotoUri, setProfilePhotoUri }}>
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
