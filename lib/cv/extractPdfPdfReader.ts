import { PdfReader } from "pdfreader";

export function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];

    new PdfReader().parseBuffer(buffer, (error, item) => {
      if (error) {
        reject(error);
        return;
      }

      if (!item) {
        resolve(chunks.join("\n").trim());
        return;
      }

      if (item.text) {
        chunks.push(String(item.text));
      }
    });
  });
}
