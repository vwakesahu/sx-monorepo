<script setup lang="ts">
import { VotingPowerItem } from '@/queries/votingPower';

defineProps<{
  votingPower: VotingPowerItem;
}>();
</script>

<template>
  <!-- Removed error message to allow voting with 0 power -->
</template>
