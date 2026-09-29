import { Long } from 'mongodb';
import { MongoDatabase, mongoDocument } from './mongodb.ts';
import { mongoSchema } from './mongodb-schema.ts';
import { hashPassword } from './password.ts';
import { loginIdentifier } from './login-identifier.ts';

export type EmptyMongoAdmin = { id: string; email: string; name: string; login: string; password: string };
type StoredDocument = ReturnType<typeof mongoDocument>;

/** Explicit fresh start, never a fallback when the existing provider is down. */
export async function initializeEmptyMongo(database: MongoDatabase, admin: EmptyMongoAdmin) {
  const email = loginIdentifier(admin.email), login = loginIdentifier(admin.login);
  if (!admin.id || !admin.name || email?.kind !== 'email' || login?.kind !== 'cpf' || typeof admin.password !== 'string' || !admin.password || admin.password.length > 256) throw new Error('Informe a identidade e o acesso do administrador no arquivo privado.');
  const passwordHash = await hashPassword(admin.password);
  await database.initialize();
  const db = await database.connection(), session = database.client.startSession();
  try {
    return await session.withTransaction(async () => {
      const state = db.collection<{ _id: string; revision?: Long; mode?: string; ownerId?: string; createdAt?: string }>('_tf_state');
      await state.updateOne({ _id: 'write-lock' }, { $inc: { revision: Long.ONE } }, { session });
      if (await state.findOne({ _id: 'data-migration' }, { session })) throw new Error('Esta base já recebeu uma migração. Inicialização vazia recusada.');
      const previous = await state.findOne({ _id: 'empty-start' }, { session });
      if (previous) {
        if (previous.mode !== 'empty-with-admin' || previous.ownerId !== admin.id) throw new Error('A base já foi inicializada para outro administrador.');
        return { alreadyInitialized: true, mode: previous.mode };
      }
      for (const table of Object.keys(mongoSchema.tables)) {
        if (await db.collection(table).findOne({}, { session, projection: { _id: 1 } })) throw new Error('Inicialização recusada: destino já contém registros em ' + table);
      }
      const now = Date.now();
      await db.collection<StoredDocument>('users').insertOne(mongoDocument('users', { id: admin.id, email: email.value, name: admin.name, role: 'admin', active: 1, cpf: login.value, created_at: now, updated_at: now }), { session });
      await db.collection<StoredDocument>('auth_credentials').insertOne(mongoDocument('auth_credentials', { user_id: admin.id, password_hash: passwordHash, updated_at: now }), { session });
      await db.collection<StoredDocument>('app_settings').insertMany([
        mongoDocument('app_settings', { key: 'owner_id', value: admin.id }),
        mongoDocument('app_settings', { key: 'owner_email', value: email.value }),
      ], { session });
      await db.collection<StoredDocument>('_schema_migrations').insertMany(Object.entries(mongoSchema.migrations).map(([name, checksum]) => mongoDocument('_schema_migrations', { name, checksum, applied_at: now })), { session });
      // This marker records an authorized empty start; it does not claim that
      // historical data was migrated or verified.
      await state.insertOne({ _id: 'empty-start', mode: 'empty-with-admin', ownerId: admin.id, createdAt: new Date(now).toISOString() }, { session });
      return { alreadyInitialized: false, mode: 'empty-with-admin' };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 15000 });
  } finally { await session.endSession(); }
}
