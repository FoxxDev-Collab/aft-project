// Server-side component helpers for Bun server
// This file provides utilities to use our UI components in server-rendered HTML

import * as UI from './index';

// Helper class to build HTML with components
export class ComponentBuilder {
  static button(props: UI.ButtonProps): string {
    return UI.Button(props);
  }

  static primaryButton(props: Omit<UI.ButtonProps, 'variant'>): string {
    return UI.PrimaryButton(props);
  }

  static secondaryButton(props: Omit<UI.ButtonProps, 'variant'>): string {
    return UI.SecondaryButton(props);
  }

  static destructiveButton(props: Omit<UI.ButtonProps, 'variant'>): string {
    return UI.DestructiveButton(props);
  }

  static card(props: UI.CardProps): string {
    return UI.Card(props);
  }

  static statusCard(props: UI.StatusCardProps): string {
    return UI.StatusCard(props);
  }

  static pageHeader(props: UI.PageHeaderProps): string {
    return UI.PageHeader(props);
  }

  static container(props: UI.ContainerProps): string {
    return UI.Container(props);
  }

  static grid(props: UI.GridProps): string {
    return UI.Grid(props);
  }

  static pageLayout(props: { header: string; children: string; footer?: string; className?: string }): string {
    return UI.PageLayout(props);
  }

  static sectionHeader(props: { title: string; description?: string; actions?: string; className?: string }): string {
    return UI.SectionHeader(props);
  }

  static formGroup(props: UI.FormGroupProps): string {
    return UI.FormGroup(props);
  }

  static input(props: UI.InputProps): string {
    return UI.Input(props);
  }

  static label(props: UI.LabelProps): string {
    return UI.Label(props);
  }

  static select(props: UI.SelectProps): string {
    return UI.Select(props);
  }

  static table(props: UI.TableProps): string {
    return UI.Table(props);
  }

  static tableSearch(props: UI.TableSearchProps): string {
    return UI.TableSearch(props);
  }

  static tableFilters(props: UI.TableFiltersProps): string {
    return UI.TableFilters(props);
  }

  static tableActions(props: UI.TableActionsProps): string {
    return UI.TableActions(props);
  }

  static tableContainer(props: {
    title?: string;
    description?: string;
    search?: string;
    filters?: string;
    actions?: string;
    table: string;
    className?: string;
  }): string {
    return UI.TableContainer(props);
  }

  static statusBadge(status: string, variant?: 'default' | 'success' | 'warning' | 'error' | 'info'): string {
    return UI.StatusBadge(status, variant);
  }

  static tableCellActions(actions: Array<{
    label: string;
    onClick: string;
    variant?: 'primary' | 'secondary' | 'destructive';
    size?: 'sm' | 'xs';
  }>): string {
    return UI.TableCellActions(actions);
  }

  static timeline(props: UI.TimelineProps): string {
    return UI.Timeline(props);
  }

  static statusProgress(props: UI.StatusProgressProps): string {
    return UI.StatusProgress(props);
  }

  static timelineStatusBadge(
    status: string, 
    variant?: 'default' | 'success' | 'warning' | 'error' | 'info',
    showProgress?: boolean,
    progressData?: { current: number; total: number }
  ): string {
    return UI.TimelineStatusBadge(status, variant, showProgress, progressData);
  }

  static viewToggle(activeView: 'table' | 'timeline'): string {
    return `
      <div class="view-toggle">
        <button 
          class="view-toggle-button ${activeView === 'table' ? 'active' : ''}" 
          onclick="switchView('table')"
          type="button"
        >
          📋 Table View
        </button>
        <button 
          class="view-toggle-button ${activeView === 'timeline' ? 'active' : ''}" 
          onclick="switchView('timeline')"
          type="button"
        >
          📅 Timeline View
        </button>
      </div>
    `;
  }
}

// Pre-built component templates for common layouts
export class Templates {
  // Admin dashboard card with actions
  static adminCard({
    title,
    description,
    primaryAction,
    secondaryAction,
    status
  }: {
    title: string;
    description: string;
    primaryAction: { label: string; onClick: string };
    secondaryAction?: { label: string; onClick: string };
    status?: { label: string; value: string; status: 'operational' | 'warning' | 'error' };
  }): string {
    const actions = [
      ComponentBuilder.primaryButton({
        children: primaryAction.label,
        onClick: primaryAction.onClick,
        size: 'sm'
      }),
      secondaryAction ? ComponentBuilder.secondaryButton({
        children: secondaryAction.label,
        onClick: secondaryAction.onClick,
        size: 'sm'
      }) : ''
    ].filter(Boolean).join(' ');

    const items = status ? [status] : [];

    return ComponentBuilder.statusCard({
      title,
      items,
      actions: `
        <div class="text-sm text-[var(--muted-foreground)] mb-4">${description}</div>
        <div class="flex gap-2">${actions}</div>
      `
    });
  }

  // Form field with label and error handling
  static formField({
    id,
    label,
    type = 'text',
    placeholder,
    required = false,
    error,
    success
  }: {
    id: string;
    label: string;
    type?: UI.InputProps['type'];
    placeholder?: string;
    required?: boolean;
    error?: string;
    success?: string;
  }): string {
    return ComponentBuilder.formGroup({
      children: [
        ComponentBuilder.label({
          htmlFor: id,
          children: label,
          required
        }),
        ComponentBuilder.input({
          id,
          name: id,
          type,
          placeholder,
          required
        }),
        error ? UI.ErrorMessage({ children: error }) : '',
        success ? UI.SuccessMessage({ children: success }) : ''
      ].filter(Boolean).join('')
    });
  }

  // Navigation menu
  static navigation(items: Array<{
    label: string;
    href: string;
    active?: boolean;
    icon?: string;
  }>): string {
    return `
      <nav class="flex space-x-1">
        ${items.map(item => `
          <a 
            href="${item.href}" 
            class="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              item.active 
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
            }"
          >
            ${item.icon ? `<span class="w-4 h-4">${item.icon}</span>` : ''}
            ${item.label}
          </a>
        `).join('')}
      </nav>
    `;
  }

  // Security audit table
  static auditTable(entries: Array<{
    timestamp: string;
    user: string;
    action: string;
    description: string;
    status: 'success' | 'warning' | 'error';
  }>): string {
    return `
      <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full divide-y divide-[var(--border)]">
            <thead class="bg-[var(--muted)]">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Time</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">User</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Action</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Description</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody class="bg-[var(--card)] divide-y divide-[var(--border)]">
              ${entries.map(entry => `
                <tr class="hover:bg-[var(--muted)]">
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-[var(--foreground)]">${entry.timestamp}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-[var(--foreground)]">${entry.user}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--foreground)]">${entry.action}</td>
                  <td class="px-6 py-4 text-sm text-[var(--muted-foreground)]">${entry.description}</td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      entry.status === 'success' ? 'bg-green-100 text-green-800' :
                      entry.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }">
                      ${entry.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
}