<script setup lang="ts">
defineProps<{
  type: 'proposition' | 'voting';
}>();

defineEmits<{
  (e: 'fetch');
}>();

// Helper to detect offchain/local space from $attrs
import { offchainNetworks } from '@/networks';
const attrs = useAttrs();
const isOffchain =
  attrs.space && offchainNetworks.includes(attrs.space.network);
</script>

<template>
  <template v-if="!isOffchain">
    <div class="flex flex-col gap-3 items-start" v-bind="$attrs">
      <UiAlert type="error">
        There was an error fetching your
        {{ type === 'voting' ? 'voting power' : 'proposal validation' }}.
      </UiAlert>
      <UiButton
        type="button"
        class="flex items-center gap-2"
        @click="$emit('fetch')"
      >
        <IH-refresh />Retry
      </UiButton>
    </div>
  </template>
</template>
