// Approver Navigation Component for consistent navigation across approver pages
import { ComponentBuilder } from "../components/ui/server-components";
import { ClipboardIcon, CheckCircleIcon, ClockIcon, FileTextIcon, ChartBarIcon, HelpCircleIcon } from "../components/icons";

export interface ApproverUser {
  email: string;
  role: string;
}

export interface ApproverNavItem {
  label: string;
  href: string;
  active?: boolean;
  icon?: string;
}

export class ApproverNavigation {
  private static readonly NAV_ITEMS: ApproverNavItem[] = [
    { label: 'Dashboard', href: '/approver', icon: ChartBarIcon({ size: 16 }) },
    { label: 'Pending Approvals', href: '/approver/pending', icon: ClockIcon({ size: 16 }) },
    { label: 'Approved', href: '/approver/approved', icon: CheckCircleIcon({ size: 16 }) },
    { label: 'Reports', href: '/approver/reports', icon: ClipboardIcon({ size: 16 }) }
  ];

  static getNavItems(currentPath: string): ApproverNavItem[] {
    return this.NAV_ITEMS.map(item => ({
      ...item,
      active: currentPath === item.href || 
               (item.href !== '/approver' && currentPath.startsWith(item.href))
    }));
  }

  static renderNavigation(currentPath: string): string {
    const navItems = this.getNavItems(currentPath);
    
    return `
      <nav class="flex space-x-1 pb-4 border-t border-[var(--border)] pt-4">
        ${navItems.map(item => `
          <a 
            href="${item.href}" 
            class="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              item.active 
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
            }"
          >
            ${item.icon ? `<span class="icon-interactive">${item.icon}</span>` : ''}
            ${item.label}
          </a>
        `).join('')}
      </nav>
    `;
  }

  static renderPageHeader(
    title: string, 
    subtitle: string, 
    user: ApproverUser, 
    currentPath: string,
    actions?: string
  ): string {
    return ComponentBuilder.pageHeader({
      title: `AFT Approver - ${title}`,
      subtitle,
      classification: 'UNCLASSIFIED',
      user,
      actions: actions || ComponentBuilder.destructiveButton({
        children: 'Logout',
        onClick: "window.location.href='/logout'",
        size: 'sm'
      }),
      navigation: this.getNavItems(currentPath)
    });
  }

  static renderLayout(
    title: string,
    subtitle: string,
    user: ApproverUser,
    currentPath: string,
    content: string,
    actions?: string
  ): string {
    const header = this.renderPageHeader(title, subtitle, user, currentPath, actions);
    
    return ComponentBuilder.pageLayout({
      header,
      children: ComponentBuilder.container({ children: content }),
      footer: `
        <div class="flex justify-between items-center text-sm text-[var(--muted-foreground)] py-4">
          <span>AFT Approver Portal v1.0</span>
          <span>Last updated: ${new Date().toLocaleString()}</span>
        </div>
      `
    });
  }

  // Breadcrumb navigation for nested approver pages
  static renderBreadcrumb(path: string): string {
    const segments = path.split('/').filter(Boolean);
    const breadcrumbs = [];
    let currentPath = '';

    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const isLast = index === segments.length - 1;
      const label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
      
      breadcrumbs.push(
        isLast 
          ? `<span class="text-[var(--foreground)]">${label}</span>`
          : `<a href="${currentPath}" class="text-[var(--primary)] hover:underline">${label}</a>`
      );
    });

    return `
      <nav class="flex items-center space-x-2 text-sm text-[var(--muted-foreground)] mb-4">
        ${breadcrumbs.join(' <span>/</span> ')}
      </nav>
    `;
  }

  // Quick stats component for approver dashboard
  static renderQuickStats(stats: Array<{ label: string; value: number | string; status: 'operational' | 'warning' | 'error' }>): string {
    return `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        ${stats.map(stat => `
          <div class="stat-card">
            <div class="text-sm text-[var(--muted-foreground)] mb-1">${stat.label}</div>
            <div class="text-2xl font-bold text-[var(--foreground)]">${stat.value}</div>
            <div class="mt-2">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                stat.status === 'operational' ? 'bg-green-100 text-green-800' :
                stat.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }">
                ${stat.status === 'operational' ? '●' : stat.status === 'warning' ? '◐' : '○'} 
                ${stat.status.charAt(0).toUpperCase() + stat.status.slice(1)}
              </span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
}