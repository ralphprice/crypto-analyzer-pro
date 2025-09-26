import { JwtPayload } from 'jsonwebtoken';

declare namespace Express {
  interface Request {
    user?: JwtPayload | { id: number; username: string };  // Or 'any' for now
  }
}
