// import { SELECTED_CHAIN } from "../lib/chain-configs";

import spaceContract from './abi/space-contract-abi.json';
import vanillaAuthenticator from './abi/vanilla-authenticator.json';
import vanillaExecutionStrategy from './abi/vanilla-execution-strategy.json';
import vanillaProposalValidationStrategy from './abi/vanilla-proposal-validation-strategy.json';
import vanillaVotingStrategy from './abi/vanilla-voting-strategy.json';

export const SPACE_CONTRACT = {
  abi: spaceContract.abi,
  bytecode: spaceContract.bytecode
};

export const VANILLA_AUTHENTICATOR = {
  abi: vanillaAuthenticator.abi,
  bytecode: vanillaAuthenticator.bytecode
};

export const VANILLA_PROPOSAL_VALIDATION_STRATEGY = {
  abi: vanillaProposalValidationStrategy.abi,
  bytecode: vanillaProposalValidationStrategy.bytecode
};

export const VANILLA_VOTING_STRATEGY = {
  abi: vanillaVotingStrategy.abi,
  bytecode: vanillaVotingStrategy.bytecode
};

export const VANILLA_EXECUTION_STRATEGY = {
  abi: vanillaExecutionStrategy.abi,
  bytecode: vanillaExecutionStrategy.bytecode
};
