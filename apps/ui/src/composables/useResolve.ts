import { resolver } from '@/helpers/resolver';
import { NetworkID } from '@/types';

export function useResolve(id: Ref<string>) {
  const resolved = ref(false);
  const networkId: Ref<NetworkID | null> = ref(null);
  const address: Ref<string | null> = ref(null);

  const { isWhiteLabel, resolved: whiteLabelResolved, space } = useWhiteLabel();

  watch(
    [id, whiteLabelResolved],
    async ([id, whiteLabelResolved]) => {
      if (whiteLabelResolved && isWhiteLabel.value && space.value) {
        networkId.value = space.value.network;
        address.value = space.value.id;
        resolved.value = true;

        return true;
      }

      if (!id) return;

      resolved.value = false;

      // Handle s: prefix for local spaces
      if (id.startsWith('s:')) {
        const contractAddress = id.substring(2);
        // For local spaces, we don't need networkId since we'll load from localStorage
        networkId.value = null;
        address.value = contractAddress;
        resolved.value = true;
        return;
      }

      const resolvedName = await resolver.resolveName(id);
      if (resolvedName) {
        networkId.value = resolvedName.networkId;
        address.value = resolvedName.address;
        resolved.value = true;
      }
    },
    { immediate: true }
  );

  return {
    resolved,
    networkId,
    address
  };
}
