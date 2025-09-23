export interface JwtPayload {
  id: number;
  username: string;
  email: string;
  is_admin?: boolean;
}