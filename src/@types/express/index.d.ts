import { Document } from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      user?: Document & {
        _id: any;
        firebaseUid: string;
        nome: string;
        email: string;
        tipo: 'motorista' | 'passageiro';
      };
    }
  }
}
