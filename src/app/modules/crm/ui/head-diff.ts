/**
 * The head-diff formatting barrel (crm-prod M5): every CRM screen outside `client/` that renders a
 * brief head diff imports it from here, so the translation table stays in one file.
 */
export {
  HEAD_DIFF_FIELD_KEYS,
  formatHeadDiffValue,
  headDiffFieldLabel,
} from './client/head-diff-format';
