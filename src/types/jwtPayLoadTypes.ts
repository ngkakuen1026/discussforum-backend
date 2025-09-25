export interface JwtPayload {
  id: number;
  username: string;
  email: string;
  isAdmin?: boolean;
}