<script setup lang="ts">
import { getCacheHash, getStampUrl } from '@/helpers/utils';
import { useSpaceQuery } from '@/queries/spaces';
import { useLocalSpace } from '@/composables/useLocalSpace';

const { setFavicon } = useFavicon();
const { param } = useRouteParser('space');
const { resolved, address, networkId } = useResolve(param);
const { loadVotes } = useAccount();
const { isWhiteLabel } = useWhiteLabel();
const { web3 } = useWeb3();
const { localSpace } = useLocalSpace();

const { data: apiSpace, isPending } = useSpaceQuery({
  networkId,
  spaceId: address
});

// Use local space if available, otherwise use API space
const space = computed(() => localSpace.value || apiSpace.value);

watch(
  [resolved, networkId, address, () => web3.value.account],
  async ([resolved, networkId, address, account]) => {
    if (!resolved || !networkId || !address) return;

    if (account) {
      loadVotes(networkId, [address]);
    }
  },
  {
    immediate: true
  }
);

watchEffect(() => {
  if (!space.value) {
    setFavicon(null);
    return;
  }

  const faviconUrl = getStampUrl(
    'space',
    space.value.spaceContractAddress ||
      `${space.value.network}:${space.value.id}`,
    16,
    getCacheHash(space.value.avatar)
  );
  setFavicon(faviconUrl);
});

onUnmounted(() => {
  if (!isWhiteLabel.value) setFavicon(null);
});
</script>

<template>
  <UiLoading v-if="isPending && !localSpace" class="block p-4" />
  <router-view v-else :space="space" />
</template>
