import 'server-only';
import { createDatabase, DatabaseFiles } from './database';
import type { ApplicationDatabase } from './database-types';

const localState = globalThis as typeof globalThis & { tfDatabase?: ApplicationDatabase; tfDatabaseFiles?: DatabaseFiles };

export const env = {
  get DB() { return localState.tfDatabase ??= createDatabase(); },
  get FILES() { return localState.tfDatabaseFiles ??= new DatabaseFiles(this.DB); },
  get WHATSAPP_VERIFY_TOKEN() { return process.env.WHATSAPP_VERIFY_TOKEN; },
  get WHATSAPP_APP_SECRET() { return process.env.WHATSAPP_APP_SECRET; },
  get WHATSAPP_ACCESS_TOKEN() { return process.env.WHATSAPP_ACCESS_TOKEN; },
  get WHATSAPP_GRAPH_VERSION() { return process.env.WHATSAPP_GRAPH_VERSION; },
  get OPENAI_API_KEY() { return process.env.OPENAI_API_KEY; },
  get OPENAI_COMMAND_MODEL() { return process.env.OPENAI_COMMAND_MODEL; },
  get OPENAI_TRANSCRIPTION_MODEL() { return process.env.OPENAI_TRANSCRIPTION_MODEL; },
  get OPENAI_DOCUMENT_MODEL() { return process.env.OPENAI_DOCUMENT_MODEL; },
  get TF_IMPORT_TOKEN() { return process.env.TF_IMPORT_TOKEN; },
};
