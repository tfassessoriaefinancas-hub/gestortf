import 'server-only';
import { resolve } from 'node:path';
import { LocalDatabase, LocalFiles } from './local-runtime';

const localState = globalThis as typeof globalThis & { tfDatabase?: LocalDatabase; tfFiles?: LocalFiles };
const directory = () => resolve(process.env.LOCAL_DATA_DIR || './data');

export const env = {
  get DB() { return localState.tfDatabase ??= new LocalDatabase(resolve(directory(), 'crm.sqlite')); },
  get FILES() { return localState.tfFiles ??= new LocalFiles(resolve(directory(), 'files')); },
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
