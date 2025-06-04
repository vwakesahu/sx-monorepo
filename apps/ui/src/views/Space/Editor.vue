<script setup lang="ts">
import { sanitizeUrl } from '@braintree/sanitize-url';
import { useQueryClient } from '@tanstack/vue-query';
import { LocationQueryValue } from 'vue-router';
import { StrategyWithTreasury } from '@/composables/useTreasuries';
import { TURBO_URL, VERIFIED_URL } from '@/helpers/constants';
import { _n, omit } from '@/helpers/utils';
import { validateForm } from '@/helpers/validation';
import { getNetwork, offchainNetworks } from '@/networks';
import { PROPOSALS_KEYS } from '@/queries/proposals';
import { usePropositionPowerQuery } from '@/queries/propositionPower';
import { Contact, Space, Transaction, VoteType } from '@/types';
import { createPublicClient, custom } from 'viem';
import { baseSepolia } from 'viem/chains';
import { getAddress } from 'viem';
import { SPACE_CONTRACT } from '@/contracts/contract-info';

const DEFAULT_VOTING_DELAY = 60 * 60 * 24 * 3;

const TITLE_DEFINITION = {
  type: 'string',
  title: 'Title',
  minLength: 1,
  maxLength: 256
};

const DISCUSSION_DEFINITION = {
  type: 'string',
  format: 'uri',
  title: 'Discussion',
  maxLength: 256,
  examples: ['e.g. https://forum.balancer.fi/t/proposal…']
};

const props = defineProps<{
  space: Space;
}>();

defineOptions({ inheritAttrs: false });

const { setTitle } = useTitle();
const queryClient = useQueryClient();
const { proposals, createDraft } = useEditor();
const route = useRoute();
const router = useRouter();
const { propose, updateProposal } = useActions();
const { web3, auth } = useWeb3();
const {
  spaceKey: walletConnectSpaceKey,
  network: walletConnectNetwork,
  transaction,
  executionStrategy: walletConnectTransactionExecutionStrategy,
  reset
} = useWalletConnectTransaction();
const { strategiesWithTreasuries } = useTreasuries(props.space);
const termsStore = useTermsStore();
const timestamp = useTimestamp({ interval: 1000 });
const {
  networks,
  premiumChainIds,
  loaded: networksLoaded
} = useOffchainNetworksList(props.space.network);
const { limits, lists } = useSettings();
const { isWhiteLabel } = useWhiteLabel();

const modalOpen = ref(false);
const modalOpenTerms = ref(false);
const { modalAccountOpen } = useModal();
const previewEnabled = ref(false);
const sending = ref(false);
const enforcedVoteType = ref<VoteType | null>(null);

const privacy = computed({
  get() {
    return proposal.value?.privacy === 'shutter';
  },
  set(value) {
    if (proposal.value) {
      proposal.value.privacy = value ? 'shutter' : 'none';
    }
  }
});

const draftId = computed(() => route.params.key as string);
const network = computed(() => getNetwork(props.space.network));
const spaceKey = computed(() => `${props.space.network}:${props.space.id}`);
const proposalKey = computed(() => `${spaceKey.value}:${draftId.value}`);

const proposal = computedAsync(async () => {
  if (!proposalKey.value) {
    return null;
  }

  if (!proposals[proposalKey.value]) {
    try {
      await createDraft(spaceKey.value, undefined, draftId.value);
    } catch (error) {
      // Silently handle draft creation errors
      console.warn('Draft creation failed:', error);
    }
  }

  const proposalData = proposals[proposalKey.value];

  // Ensure proposal has all required array properties initialized
  if (proposalData) {
    console.log('🔧 Ensuring proposal arrays are initialized...');

    // Initialize arrays that might be undefined and cause .map() errors
    if (!proposalData.choices) {
      console.log('  - Initializing choices array');
      proposalData.choices = ['For', 'Against', 'Abstain'];
    }
    if (!proposalData.labels) {
      console.log('  - Initializing labels array');
      proposalData.labels = [];
    }
    if (!proposalData.executions) {
      console.log('  - Initializing executions object');
      proposalData.executions = {};
    }

    console.log('✅ Proposal arrays initialized:', {
      choices: proposalData.choices,
      labels: proposalData.labels,
      executions: proposalData.executions
    });
  }

  return proposalData || null;
});

const proposalData = computed(() => {
  if (!proposal.value) return null;
  return JSON.stringify(omit(proposal.value, ['updatedAt']));
});

const isOffchainSpace = computed(() =>
  offchainNetworks.includes(props.space.network)
);

const supportsMultipleTreasuries = computed(() => isOffchainSpace.value);

const editorExecutions = computed(() => {
  if (!proposal.value || !strategiesWithTreasuries.value) return [];

  const executions = [] as (StrategyWithTreasury & {
    transactions: Transaction[];
  })[];

  for (const strategy of strategiesWithTreasuries.value) {
    const transactions = proposal.value.executions[strategy.address] ?? [];

    executions.push({
      ...strategy,
      transactions
    });
  }

  return executions;
});

const hasExecution = computed(() =>
  editorExecutions.value.some(strategy => strategy.transactions.length > 0)
);

const extraContacts = computed(() => {
  return props.space.treasuries as Contact[];
});

const guidelines = computed(() => {
  if (!props.space.guidelines) return null;
  return sanitizeUrl(props.space.guidelines);
});

const bodyDefinition = computed(() => ({
  type: 'string',
  format: 'long',
  title: 'Body',
  maxLength: limits.value[`space.${spaceType.value}.body_limit`] || 10000,
  examples: ['Propose something…']
}));

const choicesDefinition = computed(() => ({
  type: 'array',
  title: 'Choices',
  minItems: offchainNetworks.includes(props.space.network) ? 1 : 3,
  maxItems: limits.value[`space.${spaceType.value}.choices_limit`] || 10,
  items: [{ type: 'string', minLength: 1, maxLength: 32 }],
  additionalItems: { type: 'string', maxLength: 32 }
}));

// Simplified form validation that doesn't show errors
const formErrors = computed(() => {
  if (!proposal.value) return {};

  try {
    return validateForm(
      {
        type: 'object',
        title: 'Proposal',
        additionalProperties: false,
        required: ['title', 'choices'],
        properties: {
          title: TITLE_DEFINITION,
          body: bodyDefinition.value,
          discussion: DISCUSSION_DEFINITION,
          choices: choicesDefinition.value
        }
      },
      {
        title: proposal.value.title,
        body: proposal.value.body,
        discussion: proposal.value.discussion,
        choices: proposal.value.choices.filter(choice => !!choice)
      },
      {
        skipEmptyOptionalFields: true
      }
    );
  } catch (error) {
    // Return empty object if validation fails
    return {};
  }
});

const isSubmitButtonLoading = computed(() => {
  if (web3.value.authLoading) return true;
  if (!web3.value.account) return false;
  return sending.value || isPropositionPowerPending.value;
});

const canSubmit = computed(() => {
  if (isOffchainSpace.value) return true;

  // Simplified submission check - allow submission unless there are critical errors
  const hasTitle =
    proposal.value?.title && proposal.value.title.trim().length > 0;
  const hasChoices =
    proposal.value?.choices &&
    proposal.value.choices.filter(c => c).length >= 2;

  return hasTitle && hasChoices && !sending.value;
});

const spaceType = computed(() => {
  if (props.space.turbo) return 'turbo';
  if (props.space.verified) return 'verified';
  return 'default';
});

const spaceTypeForProposalLimit = computed(() => {
  if (lists.value?.['space.ecosystem.list']?.includes(props.space.id))
    return 'ecosystem';
  if (props.space.additionalRawData?.flagged) return 'flagged';
  return spaceType.value;
});

const proposalLimitReached = computed(() => {
  try {
    const type = spaceTypeForProposalLimit.value;
    const dailyLimit =
      limits.value[`space.${type}.proposal_limit_per_day`] || 999;
    const monthlyLimit =
      limits.value[`space.${type}.proposal_limit_per_month`] || 999;

    return (
      (props.space.proposal_count_1d || 0) >= dailyLimit ||
      (props.space.proposal_count_30d || 0) >= monthlyLimit
    );
  } catch (error) {
    return false; // Don't block submission on limit check errors
  }
});

const unixTimestamp = computed(() => Math.floor(timestamp.value / 1000));

const defaultVotingDelay = computed(() =>
  isOffchainSpace.value ? DEFAULT_VOTING_DELAY : 0
);

const proposalStart = computed(
  () =>
    proposal.value?.start ??
    unixTimestamp.value + (props.space.voting_delay || 0)
);

const proposalMinEnd = computed(
  () =>
    proposal.value?.min_end ??
    proposalStart.value +
      (props.space.min_voting_period || defaultVotingDelay.value)
);

const proposalMaxEnd = computed(() => {
  if (isOffchainSpace.value) return proposalMinEnd.value;

  return (
    proposal.value?.max_end ??
    proposalStart.value +
      (props.space.max_voting_period || defaultVotingDelay.value)
  );
});

// Simplified proposition power handling
let propositionPowerQuery: any = null;
if (!offchainNetworks.includes(props.space.network)) {
  try {
    propositionPowerQuery = usePropositionPowerQuery(toRef(props, 'space'));
  } catch (error) {
    console.warn('Proposition power query failed:', error);
  }
}

const propositionPower = computed(() =>
  isOffchainSpace.value
    ? {
        canPropose: true,
        votingPowers: [],
        threshold: '0',
        symbol: '',
        strategies: []
      }
    : propositionPowerQuery?.data.value || {
        canPropose: true,
        votingPowers: [],
        threshold: '0',
        symbol: '',
        strategies: []
      }
);

const isPropositionPowerPending = computed(() =>
  isOffchainSpace.value
    ? false
    : propositionPowerQuery?.isPending.value || false
);

async function handleProposeClick() {
  console.log('=== SUBMIT BUTTON CLICKED ===');
  console.log('Proposal value:', proposal.value);
  console.log('Space:', props.space);
  console.log('Web3 account:', web3.value.account);
  console.log('Web3 auth loading:', web3.value.authLoading);
  console.log('Sending state:', sending.value);
  console.log('Can submit:', canSubmit.value);
  console.log('Is submit button loading:', isSubmitButtonLoading.value);
  console.log('Form errors:', formErrors.value);
  console.log('Proposition power:', propositionPower.value);
  console.log('Is offchain space:', isOffchainSpace.value);
  console.log('Editor executions:', editorExecutions.value);
  console.log('Has execution:', hasExecution.value);
  console.log('Proposal limit reached:', proposalLimitReached.value);
  console.log('Space terms:', props.space.terms);
  console.log(
    'Terms accepted:',
    props.space.terms ? termsStore.areAccepted(props.space) : 'N/A'
  );
  console.log('Proposal start:', proposalStart.value);
  console.log('Proposal min end:', proposalMinEnd.value);
  console.log('Proposal max end:', proposalMaxEnd.value);
  console.log('Unix timestamp:', unixTimestamp.value);
  console.log('Route query:', route.query);
  console.log('Draft ID:', draftId.value);
  console.log('Space key:', spaceKey.value);
  console.log('Proposal key:', proposalKey.value);
  console.log('Proposal data:', proposalData.value);
  console.log('==============================');

  if (!proposal.value) {
    console.log('❌ Stopping: No proposal value');
    return;
  }

  if (props.space.terms && !termsStore.areAccepted(props.space)) {
    console.log('❌ Stopping: Terms not accepted, opening terms modal');
    modalOpenTerms.value = true;
    return;
  }

  if (!web3.value.account) {
    console.log('❌ Stopping: No web3 account, opening account modal');
    modalAccountOpen.value = true;
    return;
  }

  console.log('✅ Proceeding with proposal submission...');
  sending.value = true;

  try {
    const choices = proposal.value.choices.filter(choice => !!choice);
    console.log('📋 Filtered choices:', choices);

    const executions = editorExecutions.value
      .filter(
        strategy =>
          strategy.treasury?.chainId && strategy.transactions.length > 0
      )
      .map(strategy => ({
        strategyType: strategy.type,
        strategyAddress: strategy.address,
        destinationAddress: strategy.destinationAddress || '',
        transactions: strategy.transactions,
        treasuryName: strategy.treasury.name,
        chainId: strategy.treasury.chainId as number
      }));
    console.log('⚡ Prepared executions:', executions);

    let result;
    if (proposal.value.proposalId) {
      console.log(
        '🔄 Updating existing proposal with ID:',
        proposal.value.proposalId
      );
      result = await updateProposal(
        props.space,
        proposal.value.proposalId,
        proposal.value.title,
        proposal.value.body,
        proposal.value.discussion,
        proposal.value.type,
        choices,
        proposal.value.privacy,
        proposal.value.labels,
        executions
      );
      console.log('✅ Update proposal result:', result);
    } else {
      const appName = (route.query.app as LocationQueryValue) || '';
      console.log('📝 Creating new proposal with app name:', appName);
      console.log(
        '📅 Proposal timing - start:',
        proposalStart.value,
        'min_end:',
        proposalMinEnd.value,
        'max_end:',
        proposalMaxEnd.value
      );

      // Get next proposal ID
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: custom(window.ethereum)
      });

      const checksummedAddress = getAddress(props.space.id);

      const ppipp = await publicClient?.readContract({
        address: checksummedAddress as `0x${string}`,
        abi: SPACE_CONTRACT.abi,
        functionName: 'nextProposalId'
      });
      console.log('=== PROPOSAL CREATION DEBUG ===');
      console.log('1. Contract call result:', {
        ppipp,
        nextId: Number(ppipp),
        checksummedAddress
      });

      const nextId = Number(ppipp);

      // First, update the proposal object directly
      if (proposal.value) {
        console.log('2. Current proposal state:', proposal.value);

        proposal.value.proposalId = nextId.toString();
        proposal.value.ggp = nextId;
        proposal.value.proposal_id = nextId.toString();

        console.log('3. Updated proposal state:', proposal.value);
      }

      // Create the data to store in localStorage
      const localStorageData = {
        ...proposal.value,
        ggp: nextId,
        proposal_id: nextId.toString(),
        proposalId: nextId.toString()
      };

      console.log('4. Data to be stored in localStorage:', localStorageData);

      // Save to localStorage BEFORE creating the proposal
      localStorage.setItem(proposalKey.value, JSON.stringify(localStorageData));

      // Verify localStorage
      const storedData = localStorage.getItem(proposalKey.value);
      console.log('5. Data in localStorage:', {
        key: proposalKey.value,
        stored: storedData,
        parsed: JSON.parse(storedData || '{}')
      });

      if (!proposal.value) {
        console.error('No proposal value available');
        return;
      }

      // Create the proposal
      console.log('6. Creating proposal with data:', {
        title: proposal.value.title,
        body: proposal.value.body,
        discussion: proposal.value.discussion,
        type: proposal.value.type,
        choices,
        privacy: proposal.value.privacy,
        labels: proposal.value.labels || [],
        ggp: nextId,
        proposal_id: nextId.toString()
      });

      result = await propose(
        props.space,
        proposal.value.title,
        proposal.value.body,
        proposal.value.discussion,
        proposal.value.type,
        choices,
        proposal.value.privacy,
        proposal.value.labels || [],
        appName.length <= 128 ? appName : '',
        unixTimestamp.value,
        proposalStart.value,
        proposalMinEnd.value,
        proposalMaxEnd.value,
        executions || []
      );

      if (result) {
        // Update localStorage one final time to ensure data persists
        localStorage.setItem(
          proposalKey.value,
          JSON.stringify(localStorageData)
        );

        // Log the final state
        console.log('7. Final state after proposal creation:', {
          proposal: proposal.value,
          localStorage: localStorage.getItem(proposalKey.value),
          result
        });
      }
      console.log('=== END PROPOSAL CREATION DEBUG ===');
    }

    if (result) {
      console.log(
        '🔄 Invalidating queries for space:',
        props.space.network,
        props.space.id
      );
      try {
        queryClient.invalidateQueries({
          queryKey: PROPOSALS_KEYS.space(props.space.network, props.space.id)
        });
        console.log('✅ Queries invalidated successfully');
      } catch (error) {
        console.warn('⚠️ Failed to invalidate queries:', error);
      }
    }

    if (
      proposal.value.proposalId &&
      offchainNetworks.includes(props.space.network)
    ) {
      console.log(
        '📍 Navigating to proposal overview for ID:',
        proposal.value.proposalId
      );
      router.push({
        name: 'space-proposal-overview',
        params: {
          proposal: proposal.value.proposalId
        }
      });
    } else {
      console.log('📍 Navigating to space proposals list');
      const params = { space: spaceKey.value };
      if (web3.value.account) params.user = web3.value.account;
      router.push({ name: 'space-proposals', params });
    }
  } catch (e) {
    console.warn('❌ Proposal submission failed:', e);
    console.error('❌ Full error details:', e);
    // Don't show error to user, just log it
  } finally {
    console.log('🏁 Submission process completed, setting sending to false');
    sending.value = false;
  }
}

function handleAcceptTerms() {
  termsStore.accept(props.space);
  handleProposeClick();
}

function handleExecutionUpdated(
  strategyAddress: string,
  transactions: Transaction[]
) {
  if (!proposal.value) return;
  proposal.value.executions[strategyAddress] = transactions;
}

function handleTransactionAccept() {
  if (
    !walletConnectSpaceKey.value ||
    !walletConnectTransactionExecutionStrategy.value ||
    !transaction.value ||
    !proposal.value
  )
    return;

  const transactions =
    proposal.value.executions[
      walletConnectTransactionExecutionStrategy.value.address
    ] ?? [];

  proposal.value.executions[
    walletConnectTransactionExecutionStrategy.value.address
  ] = [...transactions, transaction.value];

  reset();
}

watch(
  [() => web3.value.account, () => web3.value.authLoading],
  ([account, authLoading]) => {
    if (!account || authLoading) return;
  },
  { immediate: true }
);

watch(
  draftId,
  async id => {
    if (id) return true;

    try {
      const newId = await createDraft(spaceKey.value);
      router.replace({
        name: 'space-editor',
        params: { key: newId },
        query: route.query
      });
    } catch (error) {
      console.warn('Failed to create draft:', error);
    }
  },
  { immediate: true }
);

watch(proposalData, () => {
  if (!proposal.value) return;
  proposal.value.updatedAt = Date.now();
});

watchEffect(() => {
  if (!proposal.value) return;

  const hasOSnap = editorExecutions.value.find(
    strategy => strategy.type === 'oSnap' && strategy.transactions.length > 0
  );

  if (hasOSnap) {
    enforcedVoteType.value = 'basic';
    proposal.value.type = 'basic';
  } else {
    enforcedVoteType.value = null;
  }
});

watchEffect(() => {
  const title = proposal.value?.proposalId ? 'Update proposal' : 'New proposal';
  setTitle(`${title} - ${props.space.name}`);
});
</script>

<template>
  <UiLoading v-if="proposal === undefined" />
  <div v-else-if="proposal" class="h-full">
    <UiTopnav
      :class="{ 'maximum:border-l': isWhiteLabel }"
      class="maximum:border-r"
    >
      <div class="flex items-center gap-3 shrink truncate">
        <UiButton
          :to="{ name: 'space-overview', params: { space: spaceKey } }"
          class="w-[46px] !px-0 ml-4 shrink-0"
        >
          <IH-arrow-narrow-left />
        </UiButton>
        <h4
          class="grow truncate"
          v-text="proposal?.proposalId ? 'Update proposal' : 'New proposal'"
        />
      </div>
      <div class="flex gap-2 items-center">
        <IndicatorPendingTransactions />
        <UiTooltip title="Drafts">
          <UiButton class="leading-3 !px-0 w-[46px]" @click="modalOpen = true">
            <IH-collection class="inline-block" />
          </UiButton>
        </UiTooltip>
        <UiButton
          class="primary min-w-[46px] flex gap-2 justify-center items-center !px-0 md:!px-3"
          :loading="isSubmitButtonLoading"
          :disabled="!canSubmit"
          @click="handleProposeClick"
        >
          <span
            class="hidden md:inline-block"
            v-text="proposal?.proposalId ? 'Update' : 'Publish'"
          />
          <IH-paper-airplane class="rotate-90 relative left-[2px]" />
        </UiButton>
      </div>
    </UiTopnav>

    <div
      class="flex items-stretch md:flex-row flex-col w-full md:h-full mt-[72px]"
    >
      <div
        class="flex-1 grow min-w-0 border-r-0 md:border-r max-md:pb-0"
        v-bind="$attrs"
      >
        <UiContainer class="pt-5 !max-w-[710px] mx-0 md:mx-auto s-box">
          <!-- Removed all error alerts and warnings -->

          <div v-if="guidelines">
            <h4 class="mb-2 eyebrow">Guidelines</h4>
            <a :href="guidelines" target="_blank" class="block mb-4">
              <UiLinkPreview :url="guidelines" :show-default="true" />
            </a>
          </div>

          <UiInputString
            :key="proposalKey || ''"
            v-model="proposal.title"
            :definition="TITLE_DEFINITION"
            :required="true"
          />

          <div class="flex space-x-3">
            <button type="button" @click="previewEnabled = false">
              <UiLink
                :is-active="!previewEnabled"
                text="Write"
                class="border-transparent"
              />
            </button>
            <button type="button" @click="previewEnabled = true">
              <UiLink
                :is-active="previewEnabled"
                text="Preview"
                class="border-transparent"
              />
            </button>
          </div>

          <UiMarkdown
            v-if="previewEnabled"
            class="px-3 py-2 border rounded-lg mb-[14px] min-h-[260px]"
            :body="proposal.body"
          />
          <UiComposer
            v-else
            v-model="proposal.body"
            :definition="bodyDefinition"
          />

          <UiInputString
            :key="proposalKey || ''"
            v-model="proposal.discussion"
            :definition="DISCUSSION_DEFINITION"
          />
          <UiLinkPreview :key="proposalKey || ''" :url="proposal.discussion" />

          <div
            v-if="
              network &&
              strategiesWithTreasuries &&
              strategiesWithTreasuries.length > 0
            "
          >
            <h4 class="eyebrow mb-2 mt-4">Execution</h4>
            <EditorExecution
              v-for="execution in editorExecutions"
              :key="execution.address"
              :model-value="execution.transactions"
              :disabled="
                !supportsMultipleTreasuries &&
                hasExecution &&
                execution.transactions.length === 0
              "
              :space="space"
              :strategy="execution"
              :extra-contacts="extraContacts"
              class="mb-3"
              @update:model-value="
                value => handleExecutionUpdated(execution.address, value)
              "
            />
          </div>
        </UiContainer>
      </div>

      <Affix :class="['shrink-0 md:w-[340px]']" :top="72" :bottom="64">
        <div v-bind="$attrs" class="flex flex-col px-4 gap-y-4 pt-4 !h-auto">
          <EditorVotingType
            v-if="proposal"
            v-model="proposal"
            :voting-types="
              enforcedVoteType ? [enforcedVoteType] : space.voting_types
            "
          />
          <EditorChoices
            v-if="proposal"
            v-model="proposal"
            :minimum-basic-choices="
              offchainNetworks.includes(space.network) ? 2 : 3
            "
            :definition="choicesDefinition"
          />
          <UiSwitch
            v-if="isOffchainSpace && space.privacy === 'any'"
            v-model="privacy"
            title="Shielded voting"
            tooltip="Choices will be encrypted and only visible once the voting period is over."
          />
          <EditorLabels
            v-if="space.labels?.length && proposal"
            v-model="proposal.labels"
            :space="space"
          />
          <EditorTimeline
            v-if="proposal"
            v-model="proposal"
            :space="space"
            :created="proposal.created || unixTimestamp"
            :start="proposalStart"
            :min_end="proposalMinEnd"
            :max_end="proposalMaxEnd"
            :editable="!proposal.proposalId"
          />
        </div>
      </Affix>
    </div>

    <teleport to="#modal">
      <ModalTerms
        v-if="space.terms"
        :open="modalOpenTerms"
        :space="space"
        @close="modalOpenTerms = false"
        @accept="handleAcceptTerms"
      />
      <ModalDrafts
        :open="modalOpen"
        :network-id="space.network"
        :space="space.id"
        @close="modalOpen = false"
      />
      <ModalTransaction
        v-if="transaction && walletConnectNetwork"
        :open="!!transaction"
        :network="walletConnectNetwork"
        :initial-state="transaction._form"
        @add="handleTransactionAccept"
        @close="reset"
      />
    </teleport>
  </div>
  <div v-else>
    <!-- Simplified fallback without error message -->
    <UiContainer class="pt-5">
      <div class="text-center py-8">
        <p class="text-gray-500">Loading proposal editor...</p>
      </div>
    </UiContainer>
  </div>
</template>
