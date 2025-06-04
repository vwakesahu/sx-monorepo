import { useWeb3 } from '@/composables/useWeb3';
import {
  createPublicClient,
  createWalletClient,
  custom,
  parseEther
} from 'viem';
import { baseSepolia } from 'viem/chains';

export function useContractWrite() {
  const { web3, auth } = useWeb3();

  const writeAsync = async ({ address, abi, functionName, args }) => {
    if (!web3.value.account) throw new Error('No account connected');
    if (!auth.value?.provider) throw new Error('No provider available');

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: custom(auth.value.provider.provider)
    });

    const walletClient = createWalletClient({
      account: web3.value.account,
      chain: baseSepolia,
      transport: custom(auth.value.provider.provider)
    });

    const hash = await walletClient.writeContract({
      address,
      abi,
      functionName,
      args
    });

    const data = await publicClient.waitForTransactionReceipt({ hash });
    return { hash, data };
  };

  return { writeAsync };
}
