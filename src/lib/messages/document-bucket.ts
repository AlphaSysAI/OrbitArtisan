export const MESSAGE_DOCUMENTS_BUCKET = "message-documents";

export function messageDocumentStoragePath(conversationId: string, fileName: string): string {
  return `${conversationId}/${fileName}`;
}
