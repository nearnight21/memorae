export interface PhotoObjectStore {
  putObject(key: string, content: string): Promise<void>;
  getObject(key: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
