// Storage interface for future backend functionality
// Currently, the pricelist generator works entirely client-side
// This file is kept for potential future enhancements

export interface IStorage {
  // Placeholder for future storage operations
}

export class MemStorage implements IStorage {
  constructor() {
    // Initialize storage
  }
}

export const storage = new MemStorage();
