<script setup lang="ts">
import { getCacheHash, getStampUrl } from '@/helpers/utils';
import { NetworkID } from '@/types';
import { computed } from 'vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    space: {
      id: string;
      avatar: string;
      network: NetworkID;
      active_proposals: number | null;
      spaceContractAddress?: string;
    };
    size?: number;
    showActiveProposals?: boolean;
  }>(),
  {
    size: 22,
    showActiveProposals: false
  }
);

const cb = computed(() => getCacheHash(props.space.avatar));

const spaceId = computed(() => {
  if (props.space.spaceContractAddress) {
    return props.space.spaceContractAddress;
  }
  return `${props.space.network}:${props.space.id}`;
});

// Check if avatar is an external URL
const isExternalUrl = computed(() => {
  return props.space.avatar && (
    props.space.avatar.startsWith('http://') ||
    props.space.avatar.startsWith('https://')
  );
});
</script>

<template>
  <div class="relative w-fit">
    <!-- Handle external URLs directly -->
    <img
      v-if="space.avatar && isExternalUrl"
      v-bind="$attrs"
      :src="space.avatar"
      :width="size"
      :height="size"
      class="rounded-full inline-block bg-skin-border object-cover"
      :style="{
        width: `${size}px`,
        height: `${size}px`
      }"
    />

    <!-- Keep original UiStamp logic for internal images or when no avatar -->
    <UiStamp
      v-else
      v-bind="$attrs"
      :id="spaceId"
      :size="size"
      :cb="cb"
      class="!bg-skin-bg"
      type="space"
    />

    <!-- Keep active proposals badge exactly as original -->
    <div
      v-if="showActiveProposals && space.active_proposals"
      class="h-[20px] min-w-[20px] absolute px-1 -bottom-2 -right-2 text-white bg-skin-success rounded-full flex items-center justify-center text-[12px] font-bold border-2 border-skin-bg"
    >
      {{ space.active_proposals }}
    </div>
  </div>
</template>