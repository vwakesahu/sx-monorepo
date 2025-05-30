<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';

const deployedContracts = ref([]);
const route = useRoute();

function normalize(str) {
  return String(str).toLowerCase().replace(/[-_]/g, '');
}

function fuzzyMatch(a, b) {
  // Returns true if either string contains the other after normalization
  const na = normalize(a);
  const nb = normalize(b);
  return na.includes(nb) || nb.includes(na);
}

onMounted(() => {
  const data = localStorage.getItem('deployedContracts');
  if (data) {
    const parsed = JSON.parse(data);
    const protocol = route.query.p || 'snapshot_x';
    const network = route.query.n || 'base-sepolia';
    deployedContracts.value = parsed.filter(
      d => fuzzyMatch(d.protocol, protocol) && fuzzyMatch(d.network, network)
    );
  }
});
</script>

<template>
  <div class="pt-5 max-w-[50rem] mx-auto px-4">
    <h1>Explore Spaces</h1>
    <div v-if="deployedContracts.length">
      <div
        v-for="space in deployedContracts"
        :key="space.createdAt"
        class="mb-6"
      >
        <h2 class="font-semibold mb-2">
          {{ space.name }}
          <span class="text-xs text-gray-400"
            >({{ space.protocol }} / {{ space.network }})</span
          >
        </h2>
        <div class="mb-2">
          <strong>Deployed At:</strong> {{ space.createdAt }}<br />
          <strong>Creator:</strong> {{ space.creatorAddress }}
        </div>
        <div class="mb-2">
          <strong>Description:</strong> {{ space.description }}
        </div>
        <div class="mb-2">
          <img
            v-if="space.icon"
            :src="space.icon"
            alt="icon"
            style="width: 48px; height: 48px; border-radius: 8px"
          />
        </div>
        <ul class="mb-4">
          <li>
            <strong>Space Contract:</strong> {{ space.spaceContractAddress }}
          </li>
          <li>
            <strong>Proposal Validation Strategy:</strong>
            {{ space.proposalValidationStrategyAddress }}
          </li>
          <li>
            <strong>Voting Strategy:</strong> {{ space.votingStrategyAddress }}
          </li>
          <li>
            <strong>Authenticator:</strong> {{ space.authenticatorAddress }}
          </li>
          <li>
            <strong>Execution Strategy:</strong>
            {{ space.executionStrategyAddress }}
          </li>
        </ul>
      </div>
    </div>
    <div v-else>
      <p>No matching spaces found in local storage.</p>
    </div>
  </div>
</template>
