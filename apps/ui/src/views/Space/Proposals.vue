<script setup lang="ts">
import { computed, ref } from 'vue';
import { LocationQueryRaw } from 'vue-router';
import ProposalIconStatus from '@/components/ProposalIconStatus.vue';
import { ProposalsFilter } from '@/networks/types';
import { useProposalsQuery } from '@/queries/proposals';
import { useSpaceVotingPowerQuery } from '@/queries/votingPower';
import { Space } from '@/types';

const props = defineProps<{ space: Space }>();

const { setTitle } = useTitle();
const router = useRouter();
const route = useRoute();
const { web3 } = useWeb3();
const {
  data: votingPower,
  isPending: isVotingPowerPending,
  isError: isVotingPowerError,
  refetch: fetchVotingPower
} = useSpaceVotingPowerQuery(
  toRef(() => web3.value.account),
  toRef(props, 'space')
);

const state = ref<NonNullable<ProposalsFilter['state']>>('any');
const labels = ref<string[]>([]);

const selectIconBaseProps = {
  size: 16
};

const spaceLabels = computed(() => {
  if (!props.space.labels) return {};

  return Object.fromEntries(props.space.labels.map(label => [label.id, label]));
});

const { fetchNextPage, hasNextPage, isPending, isError, isFetchingNextPage } =
  useProposalsQuery(
    toRef(() => props.space.network),
    toRef(() => props.space.id),
    {
      state,
      labels
    }
  );

const localKey = computed(() => `localProposals:${props.space.id}`);
const localProposals = computed(() => {
  try {
    return JSON.parse(localStorage.getItem(localKey.value) || '[]');
  } catch {
    return [];
  }
});
const latestLocalProposal = computed(() => {
  const local = localProposals.value;
  if (local.length) {
    const sorted = local.sort((a, b) => b.created - a.created);
    console.log('DEBUG: Showing local proposal', sorted[0]);
    return [sorted[0]];
  }
  // Robust fallback matching
  const normalizedSpaceId = (
    (props.space as any).spaceContractAddress ||
    props.space.id ||
    ''
  )
    .toLowerCase()
    .replace(/^s:/, '')
    .replace(/^base-sep:/, '');
  console.log('DEBUG: deployedSpaces', deployedSpaces.value);
  console.log('DEBUG: props.space', props.space);
  console.log('DEBUG: normalizedSpaceId', normalizedSpaceId);
  const deployed = deployedSpaces.value.find(
    s =>
      (s.spaceContractAddress || '')
        .toLowerCase()
        .replace(/^s:/, '')
        .replace(/^base-sep:/, '') === normalizedSpaceId
  );
  if (deployed) {
    const fakeProposal = {
      id: 'fake',
      title: 'No proposals yet',
      body: deployed.description || '',
      discussion: '',
      choices: ['For', 'Against', 'Abstain'],
      created: Date.now(),
      author: { id: deployed.creatorAddress || '0x0' },
      state: 'pending',
      space: {
        id: deployed.spaceContractAddress,
        name: deployed.name,
        avatar: deployed.icon,
        network: deployed.network
      },
      proposal_id: '',
      execution_network: deployed.network,
      isInvalid: false,
      type: (deployed.voting_types && deployed.voting_types[0]) || 'basic',
      quorum: 0,
      execution_hash: '',
      metadata_uri: '',
      executions: [],
      start: Date.now(),
      min_end: Date.now(),
      max_end: Date.now(),
      snapshot: 0,
      labels: deployed.labels || [],
      scores: [],
      scores_total: 0,
      execution_time: 0,
      execution_strategy: '',
      execution_strategy_type: '',
      execution_destination: '',
      timelock_veto_guardian: '',
      strategies_indices: [],
      strategies: [],
      strategies_params: [],
      edited: null,
      tx: '',
      execution_tx: '',
      veto_tx: '',
      vote_count: 0,
      has_execution_window_opened: false,
      execution_ready: false,
      vetoed: false,
      completed: false,
      cancelled: false,
      privacy: deployed.privacy || 'none',
      flagged: false
    };
    console.log('DEBUG: Showing fake proposal', fakeProposal);
    return [fakeProposal];
  }
  console.log('DEBUG: No proposals or deployed match found');
  return [];
});

const deployedSpaces = computed(() => {
  try {
    return JSON.parse(localStorage.getItem('deployedContracts') || '[]');
  } catch {
    return [];
  }
});

function handleClearLabelsFilter(close: () => void) {
  labels.value = [];
  close();
}

async function handleEndReached() {
  if (!hasNextPage.value) return;

  fetchNextPage();
}

watchThrottled(
  [
    () => route.query.state as string,
    () => route.query.labels as string[] | string
  ],
  ([toState, toLabels]) => {
    state.value = ['any', 'active', 'pending', 'closed'].includes(toState)
      ? (toState as NonNullable<ProposalsFilter['state']>)
      : 'any';
    let normalizedLabels = toLabels || [];
    normalizedLabels = Array.isArray(normalizedLabels)
      ? normalizedLabels
      : [normalizedLabels];
    labels.value = normalizedLabels.filter(id => spaceLabels.value[id]);
  },
  { throttle: 1000, immediate: true }
);

watch(
  [() => props.space.id, state, labels],
  ([toSpaceId, toState, toLabels], [fromSpaceId, fromState, fromLabels]) => {
    if (
      toSpaceId !== fromSpaceId ||
      toState !== fromState ||
      toLabels !== fromLabels
    ) {
      const query: LocationQueryRaw = { ...route.query };

      if (toState === 'any') {
        delete query.state;
      } else {
        query.state = toState;
      }

      if (toLabels.length) {
        query.labels = toLabels;
      } else {
        delete query.labels;
      }

      if (JSON.stringify(query) !== JSON.stringify(route.query)) {
        // NOTE: If we push the same query it will cause scroll position to be reset
        router.push({ query });
      }
    }
  },
  { immediate: true }
);

watchEffect(() => setTitle(`Proposals - ${props.space.name}`));
</script>

<template>
  <div>
    <div
      class="flex justify-between p-4 gap-2 gap-y-3 flex-row"
      :class="{ 'flex-col-reverse sm:flex-row': space.labels?.length }"
    >
      <div class="flex gap-2">
        <UiSelectDropdown
          v-model="state"
          title="Status"
          gap="12"
          placement="start"
          :items="[
            {
              key: 'any',
              label: 'Any'
            },
            {
              key: 'pending',
              label: 'Pending',
              component: ProposalIconStatus,
              componentProps: { ...selectIconBaseProps, state: 'pending' }
            },
            {
              key: 'active',
              label: 'Active',
              component: ProposalIconStatus,
              componentProps: { ...selectIconBaseProps, state: 'active' }
            },
            {
              key: 'closed',
              label: 'Closed',
              component: ProposalIconStatus,
              componentProps: { ...selectIconBaseProps, state: 'closed' }
            }
          ]"
        />
        <div v-if="space.labels?.length" class="sm:relative">
          <PickerLabel
            v-model="labels"
            :labels="space.labels"
            :button-props="{
              class: [
                'flex items-center gap-2 relative rounded-full leading-[100%] min-w-[75px] max-w-[230px] border button h-[42px] top-1 text-skin-link bg-skin-bg'
              ]
            }"
            :panel-props="{ class: 'sm:min-w-[290px] sm:ml-0 !mt-3' }"
          >
            <template #button="{ close }">
              <div
                class="absolute top-[-10px] bg-skin-bg px-1 left-2.5 text-sm text-skin-text"
              >
                Labels
              </div>
              <div
                v-if="labels.length"
                class="flex gap-1 mx-2.5 overflow-hidden items-center"
              >
                <ul v-if="labels.length" class="flex gap-1 mr-4">
                  <li v-for="id in labels" :key="id">
                    <UiProposalLabel
                      :label="spaceLabels[id].name"
                      :color="spaceLabels[id].color"
                    />
                  </li>
                </ul>
                <div
                  class="flex items-center absolute rounded-r-full right-[1px] pr-2 h-[23px] bg-skin-bg"
                >
                  <div
                    class="block w-2 -ml-2 h-full bg-gradient-to-l from-skin-bg"
                  />
                  <button
                    v-if="labels.length"
                    class="text-skin-text rounded-full hover:text-skin-link"
                    title="Clear all labels"
                    @click.stop="handleClearLabelsFilter(close)"
                    @keydown.enter.stop="handleClearLabelsFilter(close)"
                  >
                    <IH-x-circle size="16" />
                  </button>
                </div>
              </div>
              <span v-else class="px-3 text-skin-link">Any</span>
            </template>
          </PickerLabel>
        </div>
      </div>
      <div class="flex gap-2 truncate">
        <IndicatorVotingPower
          :network-id="space.network"
          :voting-power="votingPower"
          :is-loading="isVotingPowerPending"
          :is-error="isVotingPowerError"
          @fetch="fetchVotingPower"
        />
        <UiTooltip title="New proposal">
          <UiButton
            :to="{
              name: 'space-editor',
              params: { space: `${space.network}:${space.id}` }
            }"
            class="!px-0 w-[46px]"
          >
            <IH-pencil-alt />
          </UiButton>
        </UiTooltip>
      </div>
    </div>
    <ProposalsList
      title="Proposals"
      limit="off"
      :is-error="isError"
      :loading="isPending"
      :loading-more="isFetchingNextPage"
      :proposals="latestLocalProposal"
      @end-reached="handleEndReached"
    />
    <div v-if="!latestLocalProposal.length">
      <div class="px-4 py-3 flex items-center text-skin-link gap-2">
        <IH-exclamation-circle />
        <span>There are no proposals here.</span>
      </div>
      <div v-if="deployedSpaces.length" class="px-4 py-3">
        <h4 class="mb-2">Available Spaces (deployedContracts):</h4>
        <ul>
          <li v-for="space in deployedSpaces" :key="space.spaceContractAddress">
            <strong>{{ space.name }}</strong> —
            <span>{{ space.spaceContractAddress }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
