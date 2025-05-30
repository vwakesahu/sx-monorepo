import { createWalletClient, custom, type WalletClient } from 'viem';
import { polygon } from 'viem/chains';
import Connector from './connector';

export default class Unicorn extends Connector {
  private walletClient: WalletClient | null = null;

  async getWallet() {
    if (typeof window === 'undefined') return null;

    // Check if Unicorn wallet is available
    if (!window.ethereum) {
      throw new Error('Unicorn wallet not found');
    }

    // Create wallet client
    this.walletClient = createWalletClient({
      chain: polygon,
      transport: custom(window.ethereum)
    });

    return this.walletClient;
  }

  async connect() {
    try {
      const wallet = await this.getWallet();
      if (wallet) {
        this.provider = wallet;
      }
    } catch (e) {
      console.error(e);
    }
  }

  async disconnect() {
    try {
      // Clear the wallet client
      this.walletClient = null;
      this.provider = null;
    } catch (e) {
      console.error(e);
    }
  }

  async autoConnect(): Promise<void> {
    return this.connect();
  }
}
