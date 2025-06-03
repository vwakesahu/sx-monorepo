import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

export function useLocalSpace() {
  const route = useRoute();
  const localSpace = ref(null);

  // Watch for route changes to update local space data
  watch(
    () => route.params.space,
    spaceId => {
      console.log('DEBUG: route.params.space =', spaceId);
      const data = localStorage.getItem('deployedContracts');
      console.log('DEBUG: deployedContracts =', data);
      if (!spaceId) return;

      let matchAddress = spaceId;
      if (matchAddress.startsWith('s:')) matchAddress = matchAddress.slice(2);

      if (data) {
        const spaces = JSON.parse(data);
        const space = spaces.find(s => s.spaceContractAddress === matchAddress);
        console.log('DEBUG: matched local space =', space);
        if (space) {
          // Transform local space data to match API space format
          localSpace.value = {
            id: space.spaceContractAddress,
            name: space.name,
            about: space.description,
            avatar: space.icon,
            cover: space.icon, // Use icon as cover for now
            network:
              space.network === 'base-sepolia' ? 'base-sep' : space.network,
            proposal_count: 0,
            vote_count: 0,
            verified: false,
            turbo: false,
            children: [],
            spaceContractAddress: space.spaceContractAddress,
            proposalValidationStrategyAddress:
              space.proposalValidationStrategyAddress,
            votingStrategyAddress: space.votingStrategyAddress,
            authenticatorAddress: space.authenticatorAddress,
            executionStrategyAddress: space.executionStrategyAddress,
            creatorAddress: space.creatorAddress,
            createdAt: space.createdAt,
            treasuries: [], // Default empty array for treasuries
            guidelines: '', // Default empty string for guidelines
            voting_types: space.voting_types || ['basic'],
            privacy: space.privacy || 'none',
            proposalValidation: space.proposalValidation || {
              name: 'basic',
              params: { strategies: [] }
            }
          };
        }
      }
    },
    { immediate: true }
  );

  return {
    localSpace
  };
}
