export const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

export type SafeUserOutput = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
};
