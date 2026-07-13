import type { ConnectionConfig } from './types';

/** Messages sent from the extension host to the connection form webview. */
export interface FormInitMessage {
  type: 'init';
  isEdit: boolean;
  /** Existing values to prefill (never includes the password). */
  connection: Partial<ConnectionConfig>;
}

export type ExtensionToForm = FormInitMessage;

/** Messages sent from the connection form webview back to the extension host. */
export interface FormReadyMessage {
  type: 'ready';
}

export interface FormSubmitMessage {
  type: 'submit';
  connection: ConnectionConfig;
  /** Empty string in edit mode means "keep the stored password". */
  password: string;
}

export interface FormCancelMessage {
  type: 'cancel';
}

export type FormToExtension = FormReadyMessage | FormSubmitMessage | FormCancelMessage;
