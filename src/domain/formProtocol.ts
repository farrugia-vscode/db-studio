import type { ConnectionConfig } from './types';

/** Messages sent from the extension host to the connection form webview. */
export interface FormInitMessage {
  type: 'init';
  isEdit: boolean;
  /** Existing values to prefill (never includes the password). */
  connection: Partial<ConnectionConfig>;
}

/** Result of a connection test, pushed back to the form. */
export interface FormTestResultMessage {
  type: 'testResult';
  ok: boolean;
  message: string;
}

export type ExtensionToForm = FormInitMessage | FormTestResultMessage;

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

export interface FormTestMessage {
  type: 'test';
  connection: ConnectionConfig;
  /** Empty string in edit mode means "use the stored password". */
  password: string;
}

export type FormToExtension = FormReadyMessage | FormSubmitMessage | FormCancelMessage | FormTestMessage;
