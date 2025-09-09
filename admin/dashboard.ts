// Admin Dashboard - Main admin landing page
import { ComponentBuilder, Templates } from "../components/ui/server-components";
import { AdminNavigation, type AdminUser } from "./admin-nav";
import { getDb } from "../lib/database-bun";

export class AdminDashboard {
  static async render(user: AdminUser): Promise<string> {
    const db = getDb();
    
    // Get system statistics
    const userCount = db.query("SELECT COUNT(*) as count FROM users WHERE is_active = 1").get() as any;
    const requestCount = db.query("SELECT COUNT(*) as count FROM aft_requests").get() as any;
    const recentLogins = db.query(`
      SELECT COUNT(*) as count FROM security_audit_log 
      WHERE action = 'LOGIN_SUCCESS' AND timestamp > (unixepoch() - 86400)
    `).get() as any;

    // Build admin cards
    const userManagementCard = Templates.adminCard({
      title: 'User Management',
      description: 'Manage user accounts, roles, and permissions',
      primaryAction: { label: 'Manage Users', onClick: 'window.location.href=\'/admin/users\'' },
      secondaryAction: { label: 'Add User', onClick: 'window.location.href=\'/admin/users\'' },
      status: { label: 'Active Users', value: userCount?.count?.toString() || '0', status: 'operational' }
    });

    const securityCard = Templates.adminCard({
      title: 'Security Monitoring',
      description: 'View security audit logs and system security status',
      primaryAction: { label: 'View Audit Log', onClick: 'window.location.href=\'/admin/security/audit\'' },
      secondaryAction: { label: 'Security Settings', onClick: 'window.location.href=\'/admin/security/settings\'' },
      status: { label: 'Threat Level', value: 'LOW', status: 'operational' }
    });

    const requestCard = Templates.adminCard({
      title: 'Request Management',
      description: 'View and manage all AFT requests across the system',
      primaryAction: { label: 'All Requests', onClick: 'window.location.href=\'/admin/requests\'' },
      secondaryAction: { label: 'Analytics', onClick: 'window.location.href=\'/admin/reports\'' },
      status: { label: 'Total Requests', value: requestCount?.count?.toString() || '0', status: 'operational' }
    });

    const systemCard = Templates.adminCard({
      title: 'System Settings',
      description: 'Configure system parameters and maintenance',
      primaryAction: { label: 'Settings', onClick: 'window.location.href=\'/admin/system\'' },
      secondaryAction: { label: 'Maintenance', onClick: 'window.location.href=\'/admin/system\'' },
      status: { label: 'System Status', value: 'OPERATIONAL', status: 'operational' }
    });

    // Build statistics card
    const statsCard = AdminNavigation.renderQuickStats([
      { label: 'Active Users', value: userCount?.count || 0, status: 'operational' },
      { label: 'Total Requests', value: requestCount?.count || 0, status: 'operational' },
      { label: 'Today\'s Logins', value: recentLogins?.count || 0, status: 'operational' },
      { label: 'System Status', value: 'OPERATIONAL', status: 'operational' }
    ]);

    return `
      ${AdminNavigation.renderPageHeader('Dashboard', 'System Administration & Security Management', user, '/admin')}
      
      <div class="max-w-7xl mx-auto px-3 sm:px-5 lg:px-6 py-6">
        <div class="space-y-8">
          ${ComponentBuilder.sectionHeader({
            title: 'System Administration',
            description: 'Manage users, security, requests, and system settings'
          })}
          
          ${ComponentBuilder.grid({
            cols: 2,
            gap: 'lg',
            responsive: true,
            children: [userManagementCard, securityCard, requestCard, systemCard].join('')
          })}
          
          <div>
            <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">System Overview</h3>
            ${statsCard}
          </div>
          
          <div>
            <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">Recent Activity</h3>
            <div id="recent-activity" class="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
              <div class="text-center py-4">
                <div class="animate-spin w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full mx-auto mb-2"></div>
                <p class="text-sm text-[var(--muted-foreground)]">Loading recent activity...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  static getScript(): string {
    return `
      // Load recent activity on page load
      document.addEventListener('DOMContentLoaded', function() {
        loadRecentActivity();
      });

      function loadRecentActivity() {
        fetch('/api/security/audit')
          .then(response => response.json())
          .then(logs => {
            displayRecentActivity(logs.slice(0, 10)); // Show last 10 items
          })
          .catch(error => {
            document.getElementById('recent-activity').innerHTML = 
              '<div class="text-center py-4 text-[var(--destructive)]">Error loading recent activity</div>';
          });
      }

      function displayRecentActivity(logs) {
        const activityHtml = logs.map(log => {
          const date = new Date(log.timestamp * 1000);
          const statusClass = log.action.includes('SUCCESS') ? 'text-[var(--success)]' :
                             log.action.includes('FAILED') ? 'text-[var(--destructive)]' :
                             'text-[var(--warning)]';
          const statusText = log.action.includes('SUCCESS') ? 'SUCCESS' : 
                            log.action.includes('FAILED') ? 'FAILED' : 'INFO';
          
          return '<div class="flex items-center justify-between py-3 border-b border-[var(--border)] last:border-b-0">' +
                   '<div class="flex-1">' +
                     '<div class="flex items-center gap-3">' +
                       '<span class="text-sm font-mono text-[var(--muted-foreground)]">' +
                         date.toLocaleTimeString() +
                       '</span>' +
                       '<span class="text-sm font-medium">' + log.action + '</span>' +
                     '</div>' +
                     '<p class="text-sm text-[var(--muted-foreground)] mt-1">' + log.description + '</p>' +
                   '</div>' +
                   '<span class="text-xs font-medium ' + statusClass + ' uppercase">' +
                     statusText +
                   '</span>' +
                 '</div>';
        }).join('');

        document.getElementById('recent-activity').innerHTML = 
          '<h4 class="font-semibold mb-4">Recent System Events</h4>' +
          '<div class="space-y-0">' +
            activityHtml +
          '</div>' +
          '<div class="mt-4 text-center">' +
            '<a href="/admin/security/audit" class="text-sm text-[var(--primary)] hover:underline">' +
              'View Full Audit Log →' +
            '</a>' +
          '</div>';
      }
    `;
  }
}