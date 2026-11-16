// =============================================================================
// Armazenamento dos avatares (substitui o GridFS).
// -----------------------------------------------------------------------------
// Produção: Supabase Storage, bucket PRIVADO "avatars". O backend usa a chave
// secreta (service role) e serve a imagem em GET /api/users/:id/avatar, então
// o avatarUrl continua relativo e o frontend não muda.
// Testes:   AVATAR_STORAGE=memory guarda em memória (sem rede).
// =============================================================================
import { createClient } from '@supabase/supabase-js';

export interface StoredAvatar {
  data: Buffer;
  contentType: string;
}

interface AvatarStorage {
  save(userId: string, data: Buffer, contentType: string): Promise<void>;
  load(userId: string): Promise<StoredAvatar | null>;
}

const BUCKET = 'avatars';

function memoryStorage(): AvatarStorage {
  const files = new Map<string, StoredAvatar>();
  return {
    async save(userId, data, contentType) { files.set(userId, { data, contentType }); },
    async load(userId) { return files.get(userId) ?? null; },
  };
}

function supabaseStorage(): AvatarStorage {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('Defina SUPABASE_URL e SUPABASE_SECRET_KEY no .env para salvar avatares.');
  }
  const bucket = createClient(url, key, { auth: { persistSession: false } }).storage.from(BUCKET);

  return {
    async save(userId, data, contentType) {
      // upsert: substitui o avatar anterior (um arquivo por usuário)
      const { error } = await bucket.upload(userId, data, { contentType, upsert: true });
      if (error) throw error;
    },
    async load(userId) {
      const { data, error } = await bucket.download(userId);
      if (error) {
        const status = (error as any).status ?? (error as any).statusCode;
        if (status == 400 || status == 404 || /not.?found/i.test(error.message)) return null;
        throw error;
      }
      return { data: Buffer.from(await data.arrayBuffer()), contentType: data.type || 'image/jpeg' };
    },
  };
}

let storage: AvatarStorage | undefined;

export function avatarStorage(): AvatarStorage {
  storage ??= process.env.AVATAR_STORAGE === 'memory' ? memoryStorage() : supabaseStorage();
  return storage;
}
