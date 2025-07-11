<script setup lang="ts">
import {
  getUrl,
  getUserFacingErrorMessage,
  imageUpload
} from '@/helpers/utils';
import { NetworkID } from '@/types';

const model = defineModel<string | null>();

const props = defineProps<{
  space?: {
    id: string;
    cover: string;
    avatar: string;
    network: NetworkID;
  };
  user?: {
    id: string;
    cover?: string;
    avatar?: string;
  };
  error?: string;
}>();

const uiStore = useUiStore();

const fileInput = ref<HTMLInputElement | null>(null);
const isUploadingImage = ref(false);

const imgUrl = computed(() => {
  if (!model.value) return undefined;
  if (model.value.startsWith('ipfs://')) return getUrl(model.value);
  return model.value;
});

function openFilePicker() {
  if (isUploadingImage.value) return;
  fileInput.value?.click();
}

async function handleFileChange(e: Event) {
  try {
    const file = (e.target as HTMLInputElement).files?.[0];

    isUploadingImage.value = true;

    const image = await imageUpload(file as File);
    if (!image) throw new Error('Failed to upload image.');

    model.value = image.url;
    isUploadingImage.value = false;
  } catch (e) {
    uiStore.addNotification('error', getUserFacingErrorMessage(e));

    console.error('Failed to upload image', e);

    if (fileInput.value) {
      fileInput.value.value = '';
    }
    isUploadingImage.value = false;
  }
}
</script>

<template>
  <button
    type="button"
    v-bind="$attrs"
    class="relative block bg-skin-border h-[140px] mb-[-50px] w-full overflow-hidden cursor-pointer group"
    @click="openFilePicker()"
  >
    <img
      v-if="imgUrl"
      alt=""
      :src="imgUrl"
      class="size-full object-cover group-hover:opacity-80"
      :class="{
        'opacity-80': isUploadingImage
      }"
    />
    <SpaceCover
      v-else-if="props.space?.cover"
      :space="props.space"
      class="pointer-events-none group-hover:opacity-80"
    />
    <UserCover
      v-else-if="props.user?.cover"
      :user="props.user"
      class="pointer-events-none !rounded-none min-h-full group-hover:opacity-80"
    />

    <div
      class="pointer-events-none absolute group-hover:visible inset-0 z-10 flex flex-row size-full items-center content-center justify-center"
    >
      <UiLoading v-if="isUploadingImage" class="block z-10" />
      <IH-pencil v-else class="invisible text-skin-link group-hover:visible" />
    </div>
  </button>
  <input
    ref="fileInput"
    type="file"
    accept="image/jpg, image/jpeg, image/png"
    class="hidden"
    @change="handleFileChange"
  />
</template>
