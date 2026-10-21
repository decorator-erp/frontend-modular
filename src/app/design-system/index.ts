// Components
export * from './components/button/pera-button.component';
export * from './components/input/pera-input.component';
export * from './components/textarea/pera-textarea.component';
export * from './components/select/pera-select.component';
export * from './components/checkbox/pera-checkbox.component';
export * from './components/switch/pera-switch.component';
export * from './components/radio/pera-radio.component';
export * from './components/badge/pera-badge.component';
export * from './components/avatar/pera-avatar.component';
export * from './components/icon/pera-icon.component';
export * from './components/icon/icon-registry';
export * from './components/spinner/pera-spinner.component';
export * from './components/tooltip/pera-tooltip.directive';
export * from './components/card/pera-card.component';

// Components — finance form primitives (Phase G0)
export * from './components/money-input/pera-money-input.component';
export * from './components/date-input/pera-date-input.component';

// Components — markdown editor (Step 2 / Step 5 — marked + DOMPurify)
export * from './components/markdown-editor/pera-markdown-editor.component';
export * from './components/markdown-editor/pera-markdown-view.component';

// Components — primitives (Phase 4)
export * from './components/chip/pera-chip.component';
export * from './components/segmented/pera-segmented.component';
export * from './components/tag/pera-tag.component';
export * from './components/kbd/pera-kbd.component';
export * from './components/progress-bar/pera-progress-bar.component';
export * from './components/donut/pera-donut.component';
export * from './components/waterfall/pera-waterfall.component';
export * from './components/dropdown/pera-dropdown.component';
export * from './components/popover/pera-popover.component';
export * from './components/command-palette/command-palette.service';
export * from './components/command-palette/pera-command-palette.component';

// Patterns
export * from './patterns/alert/pera-alert.component';
export * from './patterns/form-field/pera-form-field.component';
export * from './patterns/modal/pera-modal.component';
export * from './patterns/modal/modal.service';
export * from './patterns/form-modal/pera-form-modal.component';
export * from './patterns/confirm-dialog/pera-confirm.component';
export * from './patterns/toast/pera-toast-container.component';
export * from './patterns/data-table/pera-data-table.component';
export * from './patterns/data-table/column-def';
export * from './patterns/empty-state/pera-empty.component';
export * from './patterns/skeleton/pera-skeleton.component';
export * from './patterns/tabs/pera-tabs.component';
export * from './patterns/breadcrumbs/pera-breadcrumbs.component';
export * from './patterns/pagination/pera-pagination.component';
export * from './patterns/drawer/pera-drawer.component';

// Patterns — layout primitives (Phase 3)
export * from './patterns/page-header/pera-page-header.component';

// Patterns — attachments (Step 4 — locked template port)
export * from './patterns/attachments-shell/pera-attachments-shell.component';
export * from './patterns/attachments-shell/pera-att-chip.component';
export * from './patterns/attachments-shell/pera-file-preview-drawer.component';

// Patterns — workflow (Phase 5)
// pera-stage-card / pera-workflow-timeline / pera-gate-card omitted at spec
// 003-T02: zero consumers at SOURCE_SHA (charter §5, verified by grep across
// the whole old app, class name and selector both) — dead code, not deferred.
export * from './patterns/workflow/pera-approval-chain.component';
export * from './patterns/workflow/pera-dependency-graph.component';

// ── Design System v2 (feature 001) — net-new + renamed primitives (Phase C) ──
// Renamed: status-badge (was status-square), priority-badge (was priority-dot),
// kpi-tile (was kpi + kpi-row), entity-header-card (was project-header). The old
// selectors above remain exported until their Phase D call-site sweep + deletion.
export * from './components/status-badge/pera-status-badge.component';
export * from './components/priority-badge/pera-priority-badge.component';
export * from './components/trend-arrow/pera-trend-arrow.component';
export * from './components/currency/pera-currency.component';
export * from './components/avatar-stack/pera-avatar-stack.component';
export * from './components/health-indicator/pera-health-indicator.component';
export * from './components/date-range-picker/pera-date-range-picker.component';
export * from './patterns/kpi-tile/pera-kpi-tile.component';
export * from './patterns/chart-card/pera-chart-card.component';
export * from './patterns/list-row/pera-list-row.component';
export * from './patterns/filter-bar/pera-filter-bar.component';
export * from './patterns/stat-card/pera-stat-card.component';
export * from './patterns/entity-header-card/pera-entity-header-card.component';

// ── Trust-rule presentation (feature 004) — FR-003/FR-004. trust-chip.ts (the
// ONE chip mapping, SC-004) is reclassified to modules/crm at spec 009 — its
// only consumers are features/crm/** (8 files, verified by grep at
// SOURCE_SHA). It never returns to design-system/. The three CSS treatments
// stay here, in patterns/trust/trust.css, imported globally from
// src/styles.css — they are DS's job; the chip-to-tone mapping is CRM's.
