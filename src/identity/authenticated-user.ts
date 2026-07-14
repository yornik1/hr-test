export interface AuthenticatedUser {
  id: string;
  email: string;
  brandId: string;
  createdAt: Date;
}

export interface JwtPayload {
  sub: string; // user id
  sid: string; // session id
  brand: string;
}
