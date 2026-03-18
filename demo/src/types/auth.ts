export type User = {
  id: string;
  email: string;
  user_metadata: Record<string, any>;
};

export type Session = {
  access_token: string;
  user: User;
  expires_at: number;
  mfa_pending?: boolean;
  mfa_setup_required?: boolean;
};
